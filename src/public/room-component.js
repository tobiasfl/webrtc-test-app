import React, { useEffect, useRef } from 'react';
import { createSocketConnectionInstance, enableScreenShare } from './connection';

const RoomComponent = (props) => {
    let socketInstance = useRef(null);

    useEffect(() => {
        startConnection();
    }, []);

    const startConnection = () => {
        socketInstance.current = createSocketConnectionInstance();
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
        </React.Fragment>
    )
}

export default RoomComponent;
