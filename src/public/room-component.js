import React, { useEffect, useRef, useState } from 'react';
import { closeBottomSender, closeTopSender, createSocketConnectionInstance, startScreenShare, sendData, startCamera, sendDataExtra } from './connection';

const FIRST_START_TIME = 15000
const VIDEO_1_START_TIME = FIRST_START_TIME;
const VIDEO_2_START_TIME = FIRST_START_TIME + 99999999;
const FILE_TRANSFER_1_START = FIRST_START_TIME + 99999999;
const FILE_TRANSFER_2_START = FIRST_START_TIME + 99999999;


const RoomComponent = (props) => {
    let socketInstance = useRef(null);
    const [chosenFile, setChosenFile] = useState(null);

    useEffect(() => {
        socketInstance.current = createSocketConnectionInstance();
        setTimeout(startMainVideoStream, VIDEO_1_START_TIME);
        setTimeout(startExtraVideoStream, VIDEO_2_START_TIME);
        setTimeout(startTestFileTransfer, FILE_TRANSFER_1_START);
        setTimeout(startExtraTestFileTransfer, FILE_TRANSFER_2_START);
    }, []);

    const handleFileInputChange = (event) => {
        const file = event.target.files[0];
        if (!file) {
            console.log("No file chosen");
            setChosenFile(null);
        }
        else {
            console.log("File was chosen");
            setChosenFile(file);
        }
    }

    const handleSendFileButtonClicked = (progressId) => {
        if(chosenFile !== null) {
            sendData(socketInstance.current, chosenFile, progressId);
        }
    }

    const handleSendFileButtonClicked2 = (progressId) => {
        if(chosenFile !== null) {
            sendDataExtra(socketInstance.current, chosenFile, progressId);
        }
    }

    const startTestFileTransfer = () => {
        const buffer = new ArrayBuffer(314572800); //about 300MB
        const file = new File([buffer], "test.txt");
        sendData(socketInstance.current, file, "send-progress");
    }

    const startExtraTestFileTransfer = () => {
        const buffer = new ArrayBuffer(314572800); //about 300MB
        const file = new File([buffer], "test.txt");
        sendDataExtra(socketInstance.current, file, "send-progress2");
    }


    const startMainVideoStream = () => {
        startCamera(socketInstance.current)
            .then(stream => {
                document.getElementById("local-camera-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting local video failed: ${err}`);
            })
    }

    const startExtraVideoStream = () => {
        startCamera(socketInstance.current)
            .then(stream => {
                document.getElementById("local-screen-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting extra local video failed: ${err}`);
            })
    }

    const startMainScreenShare = () => {
        startScreenShare(socketInstance.current)
            .then(stream => {
                document.getElementById("local-camera-container").srcObject = stream;
            })
            .catch(err => {
                console.log(`Starting local screen share failed: ${err}`);
            })
    }

    return (
        <React.Fragment>
            <table>
                <tbody>
                    <tr>
                        <td>
                            <div>
                                <video id="local-camera-container" autoPlay width="640" height="480" ></video>
                                <div>Local video</div>
                                <button onClick={startMainVideoStream}>Start camera stream</button>
                                <button onClick={startMainScreenShare}>Start screen share</button>
                                <button onClick={() => closeTopSender(socketInstance.current)}>Close</button>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-camera-container" autoPlay width="640" height="480"></video>
                                <div>Remote camera</div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div>
                                <video id="local-screen-container" autoPlay width="640" height="480"></video>
                                <div>Local screen</div>
                                <button onClick={() => enableScreenShare(socketInstance.current)}>Start screen share</button>
                                <button onClick={startExtraVideoStream}>Start extra camera stream</button>
                                <button onClick={() => closeBottomSender(socketInstance.current)}>Close</button>
                            </div>
                        </td>
                        <td>
                            <div>
                                <video id="remote-screen-container" autoPlay width="640" height="480"></video>
                                <div>Remote screen</div>
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
                                <button onClick={() => handleSendFileButtonClicked("send-progress")} disabled={chosenFile===null}>Send file</button>
                                <a id="download"></a>
                                <div >Send progress:</div>
                                <div id="send-progress"></div>
                                <div >Receive progress:</div>
                                <div id="receive-progress"></div>
                            </td>
                            <td>
                                <button onClick={() => handleSendFileButtonClicked2("send-progress2")} disabled={chosenFile===null}>Send file</button>
                                <a id="download2"></a>
                                <div >Send progress:</div>
                                <div id="send-progress2"></div>
                                <div >Receive progress:</div>
                                <div id="receive-progress2"></div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </React.Fragment>
    )
}

export default RoomComponent;
