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
    socket = io();
    roomId = 'test';
    unIdentifiedStreams = [];
    streamId2Content = {}

    constructor() {
        this.initializePeerEventHandlers();
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
        this.socket.on('message', (message) => {
            if (message.offer) {
                console.log('received offer');

                this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
                    .then(() => {
                        return this.startLocalCamera();
                    })
                    .then(() => {
                        return this.peerConnection.createAnswer();
                    })
                    .then(answer => {
                        return this.peerConnection.setLocalDescription(answer);
                    })
                    .then(() => {
                        this.sendSignallingMessage({'answer':this.peerConnection.localDescription});
                    })
                    .catch(err => {
                        console.log(`signalling answer failed: ${err}`);
                    });
            }
            else if (message.answer) {
                console.log('received answer');
                this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
            }
            else if (message.iceCandidate) {
                console.log('received candidate');
                const iceCandidate = message.iceCandidate;

                this.peerConnection.addIceCandidate(iceCandidate)
                    .catch(err => {
                        console.log(`adding ice candidate failed ${err}`);
                    });
            }
            else if (message.webcam) {
                if(message.webcam in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(message.webcam)) {
                    const remoteCameraStream = this.unIdentifiedStreams.find(ms => ms.id === message.webcam);

                    this.unIdentifiedStreams.filter(ms => ms.id !== message.webcam);
                    this.attachStreamToHtml('remote-camera-container', remoteCameraStream);
                }
                else {
                    this.streamId2Content[message.webcam] = 'webcam';
                }
            }
            else if (message.screenShare) {
                if(message.screenShare in this.streamId2Content && this.unIdentifiedStreams.map(ms => ms.id).includes(message.screenShare)) {
                    const remoteScreenStream = this.unIdentifiedStreams.find(ms => ms.id === message.screenShare);

                    this.unIdentifiedStreams.filter(ms => ms.id !== message.screenShare);
                    this.attachStreamToHtml('remote-screen-container', remoteScreenStream);
                }
                else {
                    this.streamId2Content[message.screenShare] = 'screenShare';
                }
            }
        });

        this.socket.on('joined', (roomId) => {
            this.startLocalCamera()
                .then(camera => {
                    this.sendSignallingMessage({'webcam':camera});
                })
                .catch(err =>  {
                    console.log(`adding local video failed: ${err}`);
                });
        });
    }

    initializePeerEventHandlers = () => {
        // Can also inherit from track event to separate between screen share and camera I think
        this.peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                this.socket.emit('message', {iceCandidate: event.candidate}, this.roomId);
            }
            else {
                console.log('End of ice candidates');
            }
        });

        this.peerConnection.addEventListener('connectionstatechange', event => {
            console.log("handling connectionstatechange event");
            if (this.peerConnection.connectionState === 'connected') {
                console.log('RTCPeerConnection is connected');
            }
            else if(this.peerConnection.connectionState === 'failed' 
            || this.peerConnection.connectionState === 'closed'
            || this.peerConnection.connectionState === 'disconnected'){
                console.log('peer connection failed, closed or disconnected');
            }
        });

        this.peerConnection.addEventListener('track', event => {
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
        });

        this.peerConnection.addEventListener('icegatheringstatechange', event => {
            console.log(`change in ice gathering state: ${event.target.iceGatheringState}`)
        });

        this.peerConnection.addEventListener('icecandidateerror', event => {
            console.log(`ice candidate error, code:${event.errorCode} text:${event.errorText}`);
        });

        this.peerConnection.addEventListener('negotiationneeded', event => {
            console.log(`negotation needed event fired`);
            this.peerConnection.createOffer()
                .then(offer => {
                    return this.peerConnection.setLocalDescription(offer);
                })
                .then(() => {
                    this.socket.emit('message', {'offer': this.peerConnection.localDescription}, this.roomId);
                })
                .catch(err =>  {
                    console.log(`signalling offer failed: ${err}`);
                });
        })
    }

    attachStreamToHtml = (elementId, stream) => {
        const videoContainer = document.getElementById(elementId);
        videoContainer.srcObject = stream;    
    }

    startLocalScreenShare = () => {
        //TODO: firefox struggles with this
        return navigator.mediaDevices.getDisplayMedia(mediaConstraints)
            .then(stream => {
                this.peerConnection.addTrack(stream.getVideoTracks()[0], stream);
                this.attachStreamToHtml('local-screen-container', stream);
                this.sendSignallingMessage({'screenShare': stream.id})
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
        this.socket.emit('message', message, this.roomId);
    }
}

function createSocketConnectionInstance(settings={}) {
    return new Connection(settings);
}

function enableScreenShare(connectionObj) {
    connectionObj.startLocalScreenShare();
}

export { createSocketConnectionInstance, enableScreenShare }