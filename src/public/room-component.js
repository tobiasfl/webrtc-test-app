import React, { useEffect, useRef, useState } from 'react';
import { closeBottomSender, closeTopSender, createSocketConnectionInstance, enableScreenShare, sendData, startExtraCamera, startMainCamera, sendDataExtra } from './connection';

const RoomComponent = (props) => {
    let socketInstance = useRef(null);
    const [chosenFile, setChosenFile] = useState(null);

    useEffect(() => {
        startConnection();
    }, []);

    const startConnection = () => {
        socketInstance.current = createSocketConnectionInstance();
    }

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

    return (
        <React.Fragment>
            <table>
                <tbody>
                    <tr>
                        <td>
                            <div>
                                <video id="local-camera-container" autoPlay width="640" height="480"></video>
                                <div>Local video</div>
                                <button id="main-camera-start-button" onClick={() => startMainCamera(socketInstance.current)}>Start camera stream</button>
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
                                <button id="screen-share-start-button" onClick={() => enableScreenShare(socketInstance.current)}>Start screen share</button>
                                <button id="extra-camera-start-button" onClick={() => startExtraCamera(socketInstance.current)}>Start extra camera stream</button>
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
