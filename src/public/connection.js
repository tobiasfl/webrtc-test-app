import adapter from 'webrtc-adapter';
const io =  require('socket.io-client');

const peerConnectionConfig = { iceServers: [{
        urls: 'stun:23.21.150.121' }, { 
        urls: 'stun:10.0.3.1:3478'
}]};

const peerConnectionConstraints = {
    'optional': [
        {'DtlsSrtpKeyAgreement': true}
    ]
};

const mediaConstraints = {video: true, audio: false};

class Connection {
    peerConnection = new RTCPeerConnection(peerConnectionConfig, peerConnectionConstraints);
    peerConnection2 = new RTCPeerConnection(peerConnectionConfig, peerConnectionConstraints);
    socket = io();
    roomId = 'test';
    unIdentifiedStreams = [];
    streamId2Content = {}

    constructor() {
        this.initializePeerEventHandlers(this.peerConnection, this.sendSignallingMessage);
        this.initializePeerEventHandlers(this.peerConnection2, this.sendSignallingMessage2);
        this.initializeSocketEvents();
    }

    // Signaling server interaction 
    // Three cases: created (initiator), join (new joined), joined (joined existing), full (rejected)
    initializeSocketEvents = () => {
        this.socket.on('connect', () => {
            console.log(`socket connected:${this.socket.connected}`);
            this.socket.emit('join-room', this.roomId);
        });

        this.socket.on("connect_error", (err) => {
            console.log(`connect_error due to ${err.message}`);
        });

        this.socket.on('created', (roomId) => {
            console.log('room created');

            this.roomId = roomId;
        });
        this.socket.on('join', (roomId) => {
            console.log('joining room');

            this.roomId = roomId;
        });
        this.socket.on('full', () => {
            console.log('the room was full, close a window');
        });

        this.socket.on('message', message => {
            console.log('HANDLING MSG 1')
            this.handleMessage(this.peerConnection, message, true, this.sendSignallingMessage);
        });

        this.socket.on('message2', message => {
            console.log('HANDLING MSG 2')
            this.handleMessage(this.peerConnection2, message, false, this.sendSignallingMessage2);
        })

        this.socket.on('joined', (roomId) => {
            this.startLocalCamera()
                .catch(err =>  {
                    console.log(`adding local video failed: ${err}`);
                });
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
            console.log("handling connectionstatechange event");
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
            const newStream = event.streams[0];
            if(newStream.id in this.streamId2Content) {
                if (this.streamId2Content[newStream.id] === 'webcam')
                {
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
                console.log('received unidentified track');
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
    }


    attachStreamToHtml = (elementId, stream) => {
        const videoContainer = document.getElementById(elementId);
        videoContainer.srcObject = stream;    
    }

    startLocalScreenShare = () => {
        //TODO: firefox struggles with this
        return navigator.mediaDevices.getDisplayMedia(mediaConstraints)
            .then(stream => {
                this.peerConnection2.addTrack(stream.getVideoTracks()[0], stream);
                this.attachStreamToHtml('local-screen-container', stream);
                this.sendSignallingMessage2({'screenShare': stream.id})
            });
    }

    startLocalCamera = () => {
        return navigator.mediaDevices.getUserMedia(mediaConstraints)
            .then(stream => {
                this.peerConnection.addTrack(stream.getVideoTracks()[0], stream);
                this.attachStreamToHtml('local-camera-container', stream);
                this.sendSignallingMessage({'webcam': stream.id});
            });
    }

    sendSignallingMessage = (message) => {
        console.log("SENDING MSG 1")
        this.socket.emit('message', message, this.roomId);
    }

    sendSignallingMessage2 = (message) => {
        console.log("SENDING MSG 2")
        this.socket.emit('message2', message, this.roomId);
    }

    handleMessage = (pc, message, canStartWebCam, sendMessageFunc) => {
        if (message.offer) {
            console.log('received offer');

            pc.setRemoteDescription(new RTCSessionDescription(message.offer))
                .then(() => {
                    return canStartWebCam ? this.startLocalCamera() : null;
                })
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
            console.log('received answer');
            pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
        else if (message.iceCandidate) {
            console.log('received candidate');
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
            console.log('got screen share message');
            if(message.screenShare in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(message.screenShare)) {
                const remoteScreenStream = this.unIdentifiedStreams.find(ms => ms.id === message.screenShare);

                this.unIdentifiedStreams = this.unIdentifiedStreams.filter(ms => ms.id !== message.screenShare);
                this.attachStreamToHtml('remote-screen-container', remoteScreenStream);
            }
            else {
                this.streamId2Content[message.screenShare] = 'screenShare';
            }
        }
    }
}

function createSocketConnectionInstance(settings={}) {
    return new Connection(settings);
}

function enableScreenShare(connectionObj) {
    connectionObj.startLocalScreenShare();
}

export { createSocketConnectionInstance, enableScreenShare }