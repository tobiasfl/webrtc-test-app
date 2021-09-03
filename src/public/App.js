import React, { Component } from 'react';
import './App.css';
import RoomComponent from './room-component';

class App extends Component {
  render() {
    return (
      <div className="App">
        <h1>WebRTC test app</h1>
        <RoomComponent></RoomComponent>
      </div>
    );
  }
}

export default App;
