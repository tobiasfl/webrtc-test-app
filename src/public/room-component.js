import React, { useEffect, useRef, useState } from 'react';
import Connection from './connection';

//setTimeout is stored as signed int 32, so this is max value
const INFINITY_TIMEOUT = 2147483647;
                            
const RoomComponent = (props) => {
    let socketInstance = useRef(null);

    const [chosenFile, setChosenFile] = useState(null);
    const [fileTransferProgress, setFileTransferProgress] = useState(0);
    const [fileTransferSize, setFileTransferSize] = useState(0);
    const [dataTransfersProgress, setDataTransfersProgress] = useState({});

    const urlParams = new URLSearchParams(window.location.search);

    useEffect(() => {
        socketInstance.current = new Connection(setTestTimeouts, handleRemoteStream);
    }, []);

    const setTestTimeouts = () => {
        const rtp1Start = getIntUrlParam('rtp1start') ? getIntUrlParam('rtp1start') : INFINITY_TIMEOUT;
        const rtp1End = getIntUrlParam('rtp1end') ? getIntUrlParam('rtp1end') : INFINITY_TIMEOUT;
        const rtp2Start = getIntUrlParam('rtp2start') ? getIntUrlParam('rtp2start') : INFINITY_TIMEOUT;
        const rtp2End = getIntUrlParam('rtp2end') ? getIntUrlParam('rtp2end') : INFINITY_TIMEOUT;
        const sctp1Start = getIntUrlParam('sctp1start') ? getIntUrlParam('sctp1start') : INFINITY_TIMEOUT;
        const sctp1End = getIntUrlParam('sctp1end') ? getIntUrlParam('sctp1end') : INFINITY_TIMEOUT;

        setTimeout(startMainVideo, rtp1Start);
        setTimeout(closeMainVideo, rtp1End);
        setTimeout(startExtraVideoStream, rtp2Start);
        setTimeout(closeExtraVideo, rtp2End);
        setTimeout(() => startTestDataTransfer(sctp1End-sctp1Start), sctp1Start);
    }

    const urlFlagPresent = (parameter) => urlParams.has(parameter);
    const getIntUrlParam = (parameter) => {
        const paramVal = urlParams.get(parameter);
        return paramVal ? parseInt(paramVal) : null;
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

    const startTestDataTransfer = (durationMS) => {
        socketInstance.current.runDataChannelTest(durationMS, onDataTransferProgress);
    }

    const startMainVideo = () => {
        socketInstance.current.startCamera()
            .then(stream => {
                document.getElementById("local-media-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting local video failed: ${err}`);
            })
    }

    const closeMainVideo = () => {
        socketInstance.current.closeMainSender();
        document.getElementById('local-media-container').srcObject = null;
    }

    const startExtraVideoStream = () => {
        socketInstance.current.startCamera()
            .then(stream => {
                document.getElementById("local-media-container2").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting extra local video failed: ${err}`);
            })
    }

    const closeExtraVideo = () => {
        socketInstance.current.closeExtraSender();
        document.getElementById('local-media-container2').srcObject = null;
    }

    const startMainScreenShare = () => {
        socketInstance.current.startScreenShare()
            .then(stream => {
                document.getElementById("local-media-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting local screen share failed: ${err}`);
            })
    }

    const handleRemoteStream = streamObj => {
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
                                <video id="local-media-container" autoPlay width="640" height="480" ></video>
                                <div>Local media#1</div>
                                <button onClick={startMainVideo}>Start camera stream</button>
                                <button onClick={startMainScreenShare}>Start screen share</button>
                                <button onClick={closeMainVideo}>Close</button>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-media-container" autoPlay width="640" height="480"></video>
                                <div>Remote media#1</div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div>
                                <video id="local-media-container2" autoPlay width="640" height="480"></video>
                                <div>Local media#1</div>
                                <button onClick={() => enableScreenShare(socketInstance.current)}>Start screen share</button>
                                <button onClick={startExtraVideoStream}>Start extra camera stream</button>
                                <button onClick={closeExtraVideo}>Close</button>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-media-container2" autoPlay width="640" height="480"></video>
                                <div>Remote media#2</div>
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
