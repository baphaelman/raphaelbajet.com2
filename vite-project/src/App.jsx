import React from 'react';
import Home from './Home.jsx'
import './App.css';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

function App() {
    return (
        <Router>
			<Routes>
				<Route path="/" element={<Home />} />
                {/*
                <Route path="/one-cycles" element={<One-Cycles />} />
                <Route path="/crosswords" element={<Crosswords />} />
                <Route path="/crossnumbers" element={<Crossnumbers />} />
                */}
			</Routes>
		</Router>
    );
}

export default App;
