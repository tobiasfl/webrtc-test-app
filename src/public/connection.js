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

//500MB in bytes
const TEST_DATA_ARRAY_SIZE = 500000000

//16MiB in bytes
const DC_BUFFERED_AMOUNT_MAX_THRESH = 1677216;
const DC_BUFFERED_AMOUNT_LOW_THRESH = DC_BUFFERED_AMOUNT_MAX_THRESH - DC_CHUNK_SIZE;


class Connection {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection2 = new RTCPeerConnection(peerConnectionConfig);
    socket = io();
    roomId = 'test';

    onPeerConnectedCallback = null;
    onRemoteStreamCallback = null;

    // RTCSenders, so that they can be removed when wanting to close a videostream
    mainSender = null;
    extraSender = null; 

    receiveBuffer = [];
    receivedSize = 0;
    toReceive = null;
    fileName = null;

    // ICE negotation state variables
    makingOffer = false;
    ignoreOffer = false;
    polite = false;

    constructor(onPeerConnected, onRemoteStream) {
        if (!onPeerConnected) {
            throw new Error("Invalid value for onPeerConnected callback passed in Connection constructor")
        }
        if (!onRemoteStream) {
            throw new Error("Invalid value for onRemoteStream callback passed in Connection constructor")
        }

        this.onPeerConnectedCallback = onPeerConnected;
        this.onRemoteStreamCallback = onRemoteStream;
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
            else if (pc.connectionState === 'failed') {
                pc.restartIce();
            }
            else if (pc.connectionState === 'closed'
                || pc.connectionState === 'disconnected') {
                console.log('peer connection closed or disconnected');
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

        pc.ontrack = ({track, streams}) => {
            track.onunmute = () => {
                this.onRemoteStreamCallback(streams[0]);
            }
        };

        // When the other peer sends on datachannel
        pc.ondatachannel = event => {
            const channel = event.channel;
            channel.binarytype = 'arraybuffer';

            channel.onmessage = (event) => {
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

    startLocalScreenShare = () => {
        //TODO: firefox struggles with this
        return navigator.mediaDevices.getDisplayMedia(mediaConstraints)
           .then(stream => {
               return this.handleNewStreamStarted(stream);
           });
    }

    startCamera = () => {
        return navigator.mediaDevices.getUserMedia(mediaConstraints)
            .then(stream => {
                return this.handleNewStreamStarted(stream);
            });
    }

    handleNewStreamStarted = (stream) => {
        if(this.mainSender === null) {
            this.mainSender = this.peerConnection.addTrack(stream.getVideoTracks()[0], stream);
            return stream;
        }
        else if(this.extraSender === null) {
            this.extraSender = this.peerConnection2.addTrack(stream.getVideoTracks()[0], stream);
            return stream;
        }
    }

    closeMainSender = () => {
        if(this.mainSender !== null) {
            this.peerConnection.removeTrack(this.mainSender);
            //this.peerConnection.close();
            this.mainSender = null;
        }
    }

    closeExtraSender = () => {
        if(this.extraSender !== null) {
            this.peerConnection2.removeTrack(this.extraSender);
            //this.peerConnection2.close();
            this.extraSender = null;
        }
    }

    sendFile = (file, onProgressCallback) => {
        this.sendData(file, Number.MAX_SAFE_INTEGER, onProgressCallback, this.peerConnection);
    }

    sendData = (file, maxLifeTimeMS, onProgressCallback, pc) => {
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
            let transferStartTime = new Date().getTime();
            let prevProgressUpdate = new Date().getTime();

            fileReader.onload = (e) => {
                if(((new Date()).getTime()-transferStartTime) >= maxLifeTimeMS) {
                    console.log('Transfer reached lifetime');
                    sendChannel.close();
                    return;
                }
                try {
                    sendChannel.send(e.target.result);
                }
                catch (err) {
                    console.log(`data channel failed to send: ${err}`);
                }

                offset += e.target.result.byteLength;
                // To make sure we don't overload the SCTP buffer we also check the bufferedAmount
                if (offset < file.size && sendChannel.bufferedAmount < DC_BUFFERED_AMOUNT_MAX_THRESH) {
                    if (sendChannel.bufferedAmount == 0) console.log(`bufferedAmount: ${sendChannel.bufferedAmount}`)
                    readSlice(offset);
                }

                maybeUpdateProgress();
            };

            const maybeUpdateProgress = () => {
                // TODO: this function might be reduntant
                if ((new Date()).getTime()-prevProgressUpdate >= 1000) {
                    onProgressCallback(sendChannel.id, offset);
                    prevProgressUpdate = new Date().getTime();
                }
            }

            const readSlice = o => {
                const slice = file.slice(offset, o + chunkSize);
                fileReader.readAsArrayBuffer(slice);
            }

            sendChannel.onopen = event => {
                console.log("sending a file on data channel!");
                // Starts the file reading process
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

    handleSignallingMessage = (pc, {description, candidate, metadata, ready}, sendMessageFunc) => {
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

    runDataChannelTest = (testDurationMs, onProgressFunc) => {
        //TODO: might create new PeerConnection for each new test        
        const buffer = new ArrayBuffer(TEST_DATA_ARRAY_SIZE); 
        this.sendData(new File([buffer], 'testTransfer.txt'), testDurationMs, onProgressFunc, this.peerConnection)
    }
}

export default Connection;

