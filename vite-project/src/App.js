import ReactDOM from 'react-dom';
import Modal from 'react-modal';
import App from './App.jsx';
import React from 'react';

Modal.setAppElement('#root');

ReactDOM.render(<App />, document.getElementById('root'));