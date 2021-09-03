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

const sdpConstraints = {};

const mediaConstraints = {video: true, audio: false};

class Connection {
    peerConnection = null;
    socket = null;
    roomId = 'test';
    remoteVideoStream = new MediaStream();
    localVideoStream = new MediaStream();
    remoteScreenStream = new MediaStream();
    localScreenStream = new MediaStream();

    constructor() {
        this.peerConnection = new RTCPeerConnection(peerConnectionConfig, peerConnectionConstraints);

        this.initializePeerEventHandlers();

        this.socket = io();
        this.initializeSocketEvents();

        this.socket.on('connect', () => {
            console.log(`socket connected:${this.socket.connected}`);
            this.socket.emit('join-room', this.roomId);
        });

        this.socket.on("connect_error", (err) => {
            console.log(`connect_error due to ${err.message}`);
          });

    }

    // Signaling server interaction 
    // Three cases: created (initiator), join (new joined), joined (joined existing), full (rejected)
    initializeSocketEvents = () => {
        this.socket.on('created', (roomId) => {
            console.log('room created');

            this.roomId = roomId;
        });
        this.socket.on('join', (roomId) => {
            console.log('joining room');

            this.roomId = roomId;
        });
        this.socket.on('full', () => {
            console.log('the room was full, close other window');
        });
        this.socket.on('message', (message) => {
            if (message.offer) {
                console.log('received offer');

                this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
                    .then(() => {
                        return navigator.mediaDevices.getUserMedia(mediaConstraints);
                    })
                    .then(stream => {
                        stream.getVideoTracks().forEach(track => {
                            this.localVideoStream.addTrack(track);
                            this.peerConnection.addTrack(track);
                        });
                        //TODO: send id of tracks through signalling channel to distinguish between screen and video
                        this.attachStreamToHtml('local-camera-container', this.localVideoStream);
                    })
                    .then(() => {
                        return this.peerConnection.createAnswer();
                    })
                    .then(answer => {
                        return this.peerConnection.setLocalDescription(answer);
                    })
                    .then(() => {
                        console.log("sending answer");
                        this.socket.emit('message', {'answer':this.peerConnection.localDescription}, this.roomId);
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
        });

        //when both have joined we initiate peer connection setup
        this.socket.on('joined', (roomId) => {
            navigator.mediaDevices.getUserMedia(mediaConstraints)
                .then(stream => {
                    stream.getVideoTracks().forEach(track => {
                        this.localVideoStream.addTrack(track);
                        this.peerConnection.addTrack(track);
                    });
                    this.attachStreamToHtml('local-camera-container', this.localVideoStream);
                })
                .catch(err =>  {
                    console.log(`adding local video failed: ${err}`);
                });
        });
    }

    initializePeerEventHandlers = () => {
        // Can also inherit from track event to separate between screen share and camera I think
        this.peerConnection.addEventListener('icecandidate', event => {
            console.log("handling ice candidate event");
            if (event.candidate) {
                this.socket.emit('message', {iceCandidate: event.candidate}, this.roomId);
            }
            else {
                console.log('End of ice candidates');
            }
        });

        // when peers are connected we start sending video
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
            console.log('Handling track event');

            this.remoteVideoStream.addTrack(event.track);
            this.attachStreamToHtml('remote-screen-container', this.remoteVideoStream);
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
                    console.log("sending offer");
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

    startScreenShare = () => {
        navigator.mediaDevices.getDisplayMedia(mediaConstraints)
            .then(stream => {
                stream.getVideoTracks().forEach(track => {
                    this.localVideoStream.addTrack(track);
                    this.peerConnection.addTrack(track);
                });
                //TODO: send id of tracks through signalling channel to distinguish between screen and video
                this.attachStreamToHtml('local-screen-container', this.localVideoStream);
            })
            .catch(err => {
                console.log(`unable to acquire screen capture: ${err}`);
            });
    }
}

function createSocketConnectionInstance(settings={}) {
    return new Connection(settings);
}

function enableScreenShare(connectionObj) {
    connectionObj.startScreenShare();
}

export { createSocketConnectionInstance, enableScreenShare }