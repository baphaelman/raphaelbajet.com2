import React from 'react';
import Home from './Home.jsx'
import './App.css';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import articles from '/public/articles.js';
import filePages from '/public/filePages.js';
import Article from '../components/Article.jsx';
import FilePage from '../components/FilePage.jsx';

function App() {
    return (
        <Router>
			<Routes>
				<Route path="/" element={<Home />} />
                {articles.map((article) => (
                    <Route key={article.key} path={article.path} element={<Article article={article} />} />
                ))}
			</Routes>
		</Router>
    );
}

export default App;
