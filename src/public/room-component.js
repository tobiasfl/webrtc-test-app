import React, { useEffect, useRef, useState } from 'react';
import { closeBottomSender, closeTopSender, createSocketConnectionInstance, enableScreenShare, sendData, startExtraCamera } from './connection';

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

    const handleSendFileButtonClicked = (event) => {
        if(chosenFile !== null) {
            sendData(socketInstance.current, chosenFile);
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
                                <button onClick={() => startExtraCamera(socketInstance.current)}>Start extra camera stream</button>
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
                <button onClick={handleSendFileButtonClicked} disabled={chosenFile===null}>Send file</button>

                <a id="download"></a>
                <div >Send progress:</div>
                <div id="send-progress"></div>
                <div >Receive progress:</div>
                <div id="receive-progress"></div>
            </section>
        </React.Fragment>
    )
}

export default RoomComponent;
