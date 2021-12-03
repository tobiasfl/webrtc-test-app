const adapter =  require('webrtc-adapter');
const {io} =  require('socket.io-client');

const peerConnectionConfig = { iceServers: [{
        urls: 'stun:23.21.150.121' }, { 
        urls: 'stun:10.0.3.1:3478'
}]};

const mediaConstraints = {video: true, audio: false};

//How big messages we can send on data channel
const DC_MINIMAL_SAFE_CHUNK_SIZE = 16384;
const DC_CHROMIUM_SAFE_CHUNKS_SIZE = 262144;

const DC_BUFFERED_AMOUNT_LOW_THRESH = 262144;

//The full 1MB didn't work for some reason
const DC_BUFFERED_AMOUNT_MAX_THRESH = 1048576 / 2;

class Connection {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection2 = new RTCPeerConnection(peerConnectionConfig);
    socket = io();
    roomId = 'test';
    unIdentifiedStreams = [];
    streamId2Content = {};

    //So that when testing, I can make one node only be receiver, the one that joins 
    // last becomes sender only
    joinedFirst = false;

    // RTCSenders, so that they can be removed when wanting to close a videostream
    mainSender = null;
    extraSender = null; 

    receiveBuffer = [];
    receivedSize = 0;
    toReceive = null;
    fileName = null;

    constructor() {
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
            this.joinedFirst = true;
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
            this.sendSignallingMessage({ready: 'ready'});
        });
    }

    initializePeerEventHandlers = (pc, sendMessageFunc) => {
        pc.onicecandidate = event => {
            if (event.candidate) {
                sendMessageFunc({iceCandidate: event.candidate});
            }
            else {
                console.log('End of ice candidates');
            }
        };

        pc.onconnectionstatechange = event => {
            if (pc.connectionState === 'connected') {
                console.log('RTCPeerConnection is connected');
            }
            else if(pc.connectionState === 'failed' 
                || pc.connectionState === 'closed'
                || pc.connectionState === 'disconnected'){
                console.log('peer connection failed, closed or disconnected');
            }
        };

        pc.ontrack = event => {
            console.log("ontrack");
            const newStream = event.streams[0];
            if(newStream.id in this.streamId2Content) {
                console.log("I know this stream");
                if (this.streamId2Content[newStream.id] === 'webcam')
                {
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
        };

        pc.onicegatheringstatechange = event => {
            console.log(`change in ice gathering state: ${event.target.iceGatheringState}`)
        };

        pc.onicecandidateerror = event => {
            console.log(`ice candidate error, code:${event.errorCode} text:${event.errorText}`);
        };


        pc.onnegotiationneeded = event => {
            pc.createOffer()
                .then(offer => {
                    return pc.setLocalDescription(offer);
                })
                .then(() => {
                    sendMessageFunc({'offer': pc.localDescription});
                })
                .catch(err =>  {
                    console.log(`signalling offer failed: ${err}`);
                });
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

            const chunkSize = DC_CHROMIUM_SAFE_CHUNKS_SIZE;
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
                //THROWS: 
                //Uncaught DOMException: Failed to execute 
                //'readAsArrayBuffer' on 'FileReader': 
                //The object is already busy reading Blobs.
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

    handleSignallingMessage = (pc, message, sendMessageFunc) => {
        if (message.offer) {
            pc.setRemoteDescription(new RTCSessionDescription(message.offer))
                .then(() => {
                    return pc.createAnswer();
                })
                .then(answer => {
                    return pc.setLocalDescription(answer);
                })
                .then(() => {
                    sendMessageFunc({'answer':pc.localDescription});
                })
                .catch(err => {
                    console.log(`signalling answer failed: ${err}`);
                });
        }
        else if (message.answer) {
            pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
        else if (message.iceCandidate) {
            const iceCandidate = message.iceCandidate;

            pc.addIceCandidate(iceCandidate)
                .catch(err => {
                    console.log(`adding ice candidate failed ${err}`);
                });
        }
        else if (message.webcam) {
            if(message.webcam in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(message.webcam)) {
                const remoteCameraStream = this.unIdentifiedStreams.find(ms => ms.id === message.webcam);

                this.unIdentifiedStreams = this.unIdentifiedStreams.filter(ms => ms.id !== message.webcam);
                this.attachStreamToHtml('remote-camera-container', remoteCameraStream);
            }
            else {
                this.streamId2Content[message.webcam] = 'webcam';
            }
        }
        else if (message.screenShare) {
            if(message.screenShare in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(message.screenShare)) {
                const remoteScreenStream = this.unIdentifiedStreams.find(ms => ms.id === message.screenShare);

                this.unIdentifiedStreams = this.unIdentifiedStreams.filter(ms => ms.id !== message.screenShare);
                this.attachStreamToHtml('remote-screen-container', remoteScreenStream);
            }
            else {
                this.streamId2Content[message.screenShare] = 'screenShare';
            }
        }
        else if (message.metadata) {
            console.log("message received with metadata", message.metadata.name);
            this.toReceive = message.metadata.size;
            this.fileName = message.metadata.name;
            // TODO: maybe check if the whole file is already received
        }
        else if (message.ready) {
            console.log("OTHER PEER PRESENT");
        }
    }
}

function sendData(connectionObj, file, htmlProgressElementId) {
    if(!connectionObj.joinedFirst) {
        connectionObj.sendFile1(file, htmlProgressElementId);
    }
}

function sendDataExtra(connectionObj, file, htmlProgressElementId) {
    if(!connectionObj.joinedFirst) {
        connectionObj.sendFile2(file, htmlProgressElementId);
    }
}

function createSocketConnectionInstance(settings={}) {
    return new Connection(settings);
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
