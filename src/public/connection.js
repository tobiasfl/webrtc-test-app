const adapter =  require('webrtc-adapter');
const {io} =  require('socket.io-client');

const peerConnectionConfig = { iceServers: [{
        urls: 'stun:23.21.150.121' }, { 
        urls: 'stun:10.0.3.1:3478'
}]};


//Negotiation based on:
//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation


const mediaConstraints = {video: true, audio: false};

//How big messages we can send on data channel
const DC_MINIMAL_SAFE_CHUNK_SIZE = 16384;
const DC_CHROMIUM_MAX_SAFE_CHUNKS_SIZE = 262144;

const DC_CHUNK_SIZE = DC_CHROMIUM_MAX_SAFE_CHUNKS_SIZE;


//The full 1MB
const DC_BUFFERED_AMOUNT_MAX_THRESH = 1048576;

const DC_BUFFERED_AMOUNT_LOW_THRESH = DC_BUFFERED_AMOUNT_MAX_THRESH - DC_CHUNK_SIZE;


class Connection {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection2 = new RTCPeerConnection(peerConnectionConfig);
    socket = io();
    roomId = 'test';
    unIdentifiedStreams = [];
    streamId2Content = {};

    onPeerConnectedCallback

    // RTCSenders, so that they can be removed when wanting to close a videostream
    mainSender = null;
    extraSender = null; 

    receiveBuffer = [];
    receivedSize = 0;
    toReceive = null;
    fileName = null;

    makingOffer = false;
    ignoreOffer = false;
    polite = false;

    constructor(onPeerConnected) {
        if(onPeerConnected){
            this.onPeerConnectedCallback = onPeerConnected;
        }

        //TODO: Could get callbacks in constructor for what to de when connected etc (e.g. enable/disable buttons)
        this.initializePeerEventHandlers(this.peerConnection, this.sendSignallingMessage);
        this.initializePeerEventHandlers(this.peerConnection2, this.sendSignallingMessage2);
        this.initializeSocketEvents();
    }

    // Signaling server interaction 
    // Three cases: created (initiator), join (new joined), joined (joined existing), full (rejected)
    initializeSocketEvents = () => {
        this.socket.on('connect', () => {
            this.socket.emit('join-room', this.roomId);
        });

        this.socket.on("connect_error", (err) => {
            console.log(`connect_error due to ${err.message}`);
        });

        this.socket.on('created', (roomId) => {
            this.roomId = roomId;
        });
        this.socket.on('join', (roomId) => {
            this.roomId = roomId;
        });
        this.socket.on('full', () => {
            console.log('the room was full, close a window');
        });

        this.socket.on('message', message => {
            this.handleSignallingMessage(this.peerConnection, message, this.sendSignallingMessage);
        });

        this.socket.on('message2', message => {
            this.handleSignallingMessage(this.peerConnection2, message, this.sendSignallingMessage2);
        })

        this.socket.on('joined', (roomId) => {
            this.polite = true;
            if(this.onPeerConnectedCallback) {
                this.onPeerConnectedCallback();
            }
            this.sendSignallingMessage({ready: 'ready'});
        });
    }

    initializePeerEventHandlers = (pc, sendMessageFunc) => {
        pc.onicecandidate = ({candidate}) => sendMessageFunc({candidate});

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                console.log('RTCPeerConnection is connected');
            }
            else if(pc.connectionState === 'failed') {
                pc.restartIce();
            }
            else if(pc.connectionState === 'closed'
                || pc.connectionState === 'disconnected'){
                console.log('peer connection closed or disconnected');
            }
        };

        pc.ontrack = ({track, streams}) => {
            const newStream = streams[0];
            track.onunmute = () => {
                if(newStream.id in this.streamId2Content) {
                    console.log("I know this stream");
                    if (this.streamId2Content[newStream.id] === 'webcam')
                    {
                        //TODO: There seems to be some bug here so that the stream is sometimes not 
                        //presented, even though it is being transmitted
                        console.log("attaching stream");
                        this.attachStreamToHtml('remote-camera-container', newStream);
                    }
                    else if (this.streamId2Content[newStream.id] === 'screenShare') {
                        this.attachStreamToHtml('remote-screen-container', newStream);
                    }
                    else {
                        console.log('invalid id mapping for new stream');
                    }
                    delete this.streamId2Content[newStream.id];
                }
                else {
                    console.log("unidentified stream");
                    this.unIdentifiedStreams.push(newStream);
                }
            }
        };

        pc.onicegatheringstatechange = event => {
            console.log(`change in ice gathering state: ${event.target.iceGatheringState}`)
        };

        pc.onicecandidateerror = event => {
            console.log(`ice candidate error, code:${event.errorCode} text:${event.errorText}`);
        };

        pc.onnegotiationneeded = () => {
            this.makingOffer = true;
            pc.setLocalDescription()
                .then(() => {
                    sendMessageFunc({description: pc.localDescription});
                })
                .catch(err => {
                    console.log(`signalling offer failed: ${err}`);
                })
                .finally(() => {
                    this.makingOffer = false;
                })
        };
        // When the other peer sends on datachannel
        pc.ondatachannel = event => {
            const channel = event.channel;
            channel.binarytype = 'arraybuffer';

            channel.onmessage = this.handleDataChannelMessageReceived;

            //Reset stuff from previous download
            this.receivedSize = 0;
            this.fileName = null;
            const downloadAnchor = document.querySelector("a#download");
            if(downloadAnchor.href) {
                URL.revokeObjectURL(downloadAnchor.href);
                downloadAnchor.removeAttribute('href');
            }
        };
    }

    handleDataChannelMessageReceived = (event) => {
                this.receiveBuffer.push(event.data);
                //For some reason these differ between chrome and firefox
                this.receivedSize += event.data.size ? event.data.size : event.data.byteLength;

                //update html
                const sendProgressMeter = document.getElementById('receive-progress');
                sendProgressMeter.textContent = `${this.receivedSize}/${this.toReceive}`;

                if(this.toReceive !== null && this.receivedSize === this.toReceive){
                    console.log("received the whole file now");
                    const received = new Blob(this.receiveBuffer);
                    this.receiveBuffer = [];

                    const downloadAnchor = document.querySelector("a#download");
                    downloadAnchor.href = URL.createObjectURL(received);
                    downloadAnchor.download = this.filename;
                    downloadAnchor.textContent = "Click to download the file";
                    downloadAnchor.style.dissplay = 'block';
                }
            };

    attachStreamToHtml = (elementId, stream) => {
        const videoContainer = document.getElementById(elementId);
        videoContainer.srcObject = stream;    
    }

    startLocalScreenShare = () => {
        //TODO: firefox struggles with this
        return navigator.mediaDevices.getDisplayMedia(mediaConstraints)
           .then(stream => {
               return this.handleNewStreamStarted(stream);
           });
    }

    startLocalCamera = () => {
        return navigator.mediaDevices.getUserMedia(mediaConstraints)
            .then(stream => {
                return this.handleNewStreamStarted(stream);
            });
    }

    handleNewStreamStarted = (stream) => {
        if(this.mainSender === null) {
            this.mainSender = this.peerConnection.addTrack(stream.getVideoTracks()[0], stream);
            this.sendSignallingMessage({'webcam': stream.id});
            return stream;
        }
        else if(this.extraSender === null) {
            this.extraSender = this.peerConnection2.addTrack(stream.getVideoTracks()[0], stream);
            this.sendSignallingMessage2({'screenShare': stream.id})
            return stream;
        }
        else {
            throw "Only two streams can be running at the same time";
        }
    }

    closeMainSender = () => {
        if(this.mainSender !== null) {
            this.peerConnection.removeTrack(this.mainSender);
            this.peerConnection.close();
            document.getElementById('local-camera-container').srcObject = null;
            this.mainSender = null;
        }
    }

    closeExtraSender = () => {
        if(this.extraSender !== null) {
            this.peerConnection2.removeTrack(this.extraSender);
            this.peerConnection2.close();
            document.getElementById('local-screen-container').srcObject = null;
            this.extraSender = null;
        }
    }

    sendFile1 = (file, htmlProgressElementId) => {
        this.sendFile(file, htmlProgressElementId, this.peerConnection);
    }
   
    sendFile2 = (file, htmlProgressElementId) => {
        this.sendFile(file, htmlProgressElementId, this.peerConnection2);
    }   


    sendFile = (file, htmlProgressElementId, pc) => {
        //TODO: add exception handler 
        try {
            //First send metadata via the signalling channel
            this.sendSignallingMessage({metadata:{size: file.size, name: file.name}});

            const sendChannel = pc.createDataChannel("sendChannel");
            sendChannel.bufferedAmountLowThreshold = DC_BUFFERED_AMOUNT_LOW_THRESH;


            const fileReader = new FileReader();
            fileReader.onerror = (error) => console.log("Error reading file:", error);
            fileReader.onabort = (event) => console.log("File reading aborted:", event);

            const chunkSize = DC_CHUNK_SIZE;
            let offset = 0;

            fileReader.onload = (e) => {
                try {
                    sendChannel.send(e.target.result);
                }
                catch (err) {
                    console.log(`data channel failed to send: ${err}`);
                }


                offset += e.target.result.byteLength;
                // To make sure we don't overload the SCTP buffer we also check the bufferedAmount
                if (offset < file.size && sendChannel.bufferedAmount < DC_BUFFERED_AMOUNT_MAX_THRESH) {
                    readSlice(offset);
                }

                const sendProgressMeter = document.getElementById(htmlProgressElementId);
                sendProgressMeter.textContent = `${offset}/${file.size}`;
            };

            const readSlice = o => {
                const slice = file.slice(offset, o + chunkSize);
                fileReader.readAsArrayBuffer(slice);
            }


            sendChannel.onopen = event => {
                console.log("sending a file on data channel!");
                // To start the file reading process
                readSlice(0);
            }

            sendChannel.onmessage = event => {
                console.log(`Received file on data channel`);
            }

            sendChannel.onclose = event => {
                console.log('Send channel is closed');
            }

            sendChannel.onerror = event => {
                console.log(`SendChannel error: ${event.error}`);
            }

            sendChannel.onbufferedamountlow = event => {
                // Checking that FileReader is not alread busy loading, else it might crash 
                if (offset < file.size && fileReader.readyState !== fileReader.LOADING) {
                    readSlice(offset);
                }
            }

        } catch (e) {
            console.log(`failed to create data channel ${e}`);
        }
    }

    sendSignallingMessage = (message) => {
        this.socket.emit('message', message, this.roomId);
    }

    sendSignallingMessage2 = (message) => {
        this.socket.emit('message2', message, this.roomId);
    }

    handleSignallingMessage = (pc, {description, candidate, webcam, screenShare, metadata, ready}, sendMessageFunc) => {
        if (description || candidate) {

            try {
                if (description) {
                    const offerCollision = (description.type == 'offer') && 
                        (this.makingOffer || pc.signalingState != "stable");

                    this.ignoreOffer = !this.polite && offerCollision;
                    if(this.ignoreOffer) {
                        console.log("ignoring offer");
                        return;
                    }

                     pc.setRemoteDescription(description)
                        .then(() => {
                            if (description.type == 'offer') {
                                pc.setLocalDescription()
                                    .then(() => {
                                        sendMessageFunc({description: pc.localDescription});
                                    });
                        }
                    });
                } else if(candidate) {
                    pc.addIceCandidate(candidate)
                        .catch((err) => {
                            if (!this.ignoreOffer) {
                                throw err;
                            }
                        });
                }
            } catch(err) {
                console.error(err);
            }
        }
        else if (webcam) {
            if(webcam in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes.webcam) {
                const remoteCameraStream = this.unIdentifiedStreams.find(ms => ms.id ===webcam);

                this.unIdentifiedStreams = this.unIdentifiedStreams.filter(ms => ms.id !==webcam);
                this.attachStreamToHtml('remote-camera-container', remoteCameraStream);
            }
            else {
                this.streamId2Content[webcam] = 'webcam';
            }
        }
        else if (screenShare) {
            if(screenShare in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(screenShare)) {
                const remoteScreenStream = this.unIdentifiedStreams.find(ms => ms.id === screenShare);

                this.unIdentifiedStreams = this.unIdentifiedStreams.filter(ms => ms.id !== screenShare);
                this.attachStreamToHtml('remote-screen-container', remoteScreenStream);
            }
            else {
                this.streamId2Content[screenShare] = 'screenShare';
            }
        }
        else if (metadata) {
            console.log("message received with metadata", metadata.name);
            this.toReceive = metadata.size;
            this.fileName = metadata.name;
            // TODO: maybe check if the whole file is already received
        }
        else if (ready) {
            if(this.onPeerConnectedCallback) {
                this.onPeerConnectedCallback();
            }
            console.log("OTHER PEER PRESENT");
        }
    }
}

function sendData(connectionObj, file, htmlProgressElementId) {
    connectionObj.sendFile1(file, htmlProgressElementId);
}

function sendDataExtra(connectionObj, file, htmlProgressElementId) {
    connectionObj.sendFile2(file, htmlProgressElementId);
}

function createSocketConnectionInstance(onPeerConnected) {
    return new Connection(onPeerConnected);
}

function startCamera(connectionObj) {
    return connectionObj.startLocalCamera();
}

function startScreenShare(connectionObj) {
    return connectionObj.startLocalScreenShare();
}

function closeTopSender(connectionObj) {
    connectionObj.closeMainSender();
}

function closeBottomSender(connectionObj) {
    connectionObj.closeExtraSender();
}

export { closeTopSender, closeBottomSender, createSocketConnectionInstance, startScreenShare, sendData, startCamera, sendDataExtra }
