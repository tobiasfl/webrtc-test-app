import React, { useEffect, useRef, useState } from 'react';
import {resolveIntUrlParam, urlParamPresent} from './config-helper';
import Connection from './connection';

//setTimeout is stored as signed int 32, so this is max value
const INFINITY_TIMEOUT = 2147483647;
                            
const RoomComponent = (props) => {
    let socketInstance = useRef(null);
    let socketInstance2 = useRef(null);

    const [socket1Settings, setSocket1Settings] = useState("");

    const [remoteStreamSettings, setRemoteStreamSettings] = useState("");

    const [chosenFile, setChosenFile] = useState(null);
    const [fileTransferProgress, setFileTransferProgress] = useState(0);
    const [fileTransferSize, setFileTransferSize] = useState(0);
    const [dataTransfersProgress, setDataTransfersProgress] = useState({});

    useEffect(() => {
        socketInstance.current = new Connection('pc1', setTestTimeouts, handleRemoteStream);
        socketInstance2.current = new Connection('pc2', setTestTimeouts2, handleRemoteStream);
    }, []);

    const setTestTimeouts = () => {
        const rtp1Start = resolveIntUrlParam('rtp1start', INFINITY_TIMEOUT);
        const rtp1End = resolveIntUrlParam('rtp1end', INFINITY_TIMEOUT);
        setTimeout(startMainVideo, rtp1Start);
        setTimeout(closeMainVideo, rtp1End);

        const sctp1Start = resolveIntUrlParam('sctp1start', INFINITY_TIMEOUT);
        const sctp1End = resolveIntUrlParam('sctp1end', INFINITY_TIMEOUT);
        setTimeout(() => socketInstance.current.runDataChannelTest(sctp1End-sctp1Start, onDataTransferProgress), sctp1Start);

        setTimeout(socketInstance.current.destroyConnection, Math.max(rtp1End, sctp1End));
    }

    const setTestTimeouts2 = () => {
        const rtp2Start = resolveIntUrlParam('rtp2start', INFINITY_TIMEOUT);
        const rtp2End = resolveIntUrlParam('rtp2end', INFINITY_TIMEOUT);
        setTimeout(startExtraVideoStream, rtp2Start);
        setTimeout(closeExtraVideo, rtp2End);

        const sctp2Start = resolveIntUrlParam('sctp2start', INFINITY_TIMEOUT);
        const sctp2End = resolveIntUrlParam('sctp2end', INFINITY_TIMEOUT);
        setTimeout(() => socketInstance2.current.runDataChannelTest(sctp2End-sctp2Start, onDataTransferProgress), sctp2Start);

        setTimeout(socketInstance2.current.destroyConnection, Math.max(rtp2End, sctp2End));
    }

    const handleFileInputChange = (event) => {
        const file = event.target.files[0];
        setChosenFile(file ? file : null);
    }

    const handleSendFileButtonClicked = () => {
        if(chosenFile !== null) {
            setFileTransferSize(chosenFile.size);
            socketInstance.current.sendFile(chosenFile, onFileTransferProgress);
        }
    }

    const startMainVideo = () => {
        socketInstance.current.startCamera()
            .then(stream => {
                document.getElementById("local-media-container").srcObject = stream;
                setSocket1Settings(getStreamSettings(stream));
            })
            .catch(err => {
                console.log(`Starting local video failed: ${err}`);
            })
    }

    const closeMainVideo = () => {
        socketInstance.current.stopAllStreams();
        document.getElementById('local-media-container').srcObject = null;
    }

    const startExtraVideoStream = () => {
        socketInstance2.current.startCamera()
            .then(stream => {
                document.getElementById("local-media-container2").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting extra local video failed: ${err}`);
            })
    }

    const closeExtraVideo = () => {
        socketInstance2.current.stopAllStreams();
        document.getElementById('local-media-container2').srcObject = null;
    }

    const startMainScreenShare = () => {
        socketInstance.current.startLocalScreenShare()
            .then(stream => {
                document.getElementById("local-media-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting local screen share failed: ${err}`);
            })
    }

    const getStreamSettings = (stream) => {
        const track = stream.getVideoTracks()[0];
        return JSON.stringify(track.getSettings());
    }

    const handleRemoteStream = streamObj => {
        setRemoteStreamSettings(getStreamSettings(streamObj));

        console.log("Handling remote stream.");
        if (!document.getElementById("remote-media-container").srcObject) {
            document.getElementById("remote-media-container").srcObject = streamObj;
        }
        else if (!document.getElementById("remote-media-container2").srcObject) {
            document.getElementById("remote-media-container2").srcObject = streamObj;
        }
        else {
            console.log("Error: More than 2 remote streams are being received.");
        }
    }

    const onFileTransferProgress = (dataChannelId, progressBytes) => {
        setFileTransferProgress(progressBytes);
    }

    const onDataTransferProgress = (dataChannelId, progressBytes) => {
        const newObj = {};
        newObj[dataChannelId] = progressBytes;
        setDataTransfersProgress({...dataTransfersProgress, ...newObj});
    }

    return (
        <React.Fragment>
            <table>
                <tbody>
                    <tr>
                        <td>
                            <div>
                                <video id="local-media-container" autoPlay width="1280" height="720" ></video>
                                <div>Local media#1</div>
                                <button onClick={startMainVideo}>Start camera stream</button>
                                <button onClick={startMainScreenShare}>Start screen share</button>
                                <button onClick={closeMainVideo}>Close</button>
                                <div>{socket1Settings}</div>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-media-container" autoPlay width="1280" height="720"></video>
                                <div>Remote media#1</div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div>
                                <video id="local-media-container2" autoPlay width="1280" height="720"></video>
                                <div>Local media#2</div>
                                <button onClick={startMainScreenShare}>Start screen share</button>
                                <button onClick={startExtraVideoStream}>Start extra camera stream</button>
                                <button onClick={closeExtraVideo}>Close</button>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-media-container2" autoPlay width="1280" height="720"></video>
                                <div>Remote media#2</div>
                                <div>{remoteStreamSettings}</div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <section>
                <form>
                    <input type="file" onChange={handleFileInputChange}/>
                </form>
                <table>
                    <tbody>
                        <tr>
                            <td>
                                <button onClick={() => handleSendFileButtonClicked()} disabled={chosenFile===null}>Send file</button>
                                <a id="download"></a>
                                <div >Send progress:{fileTransferProgress}/{fileTransferSize}</div>
                                <div id="send-progress"></div>
                                <div >Receive progress:</div>
                                <div id="receive-progress"></div>
                            </td>
                            {Object.entries(dataTransfersProgress).map(e => 
                                <td key={e[0]}>
                                    <div>RTCDataChannelId: {e[0]}</div>
                                    <div>Sent bytes: {e[1]}</div>
                                </td>
                            )}
                        </tr>
                    </tbody>
                </table>
            </section>
        </React.Fragment>
    );
}

export default RoomComponent;
