import React from 'react';
import BackHeader from '/components/BackHeader.jsx';

function Article({ article }) {
    const articleStyle = {
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
    }

    const contentStyle = {
        padding: "1em",
        width: '80%',
    }

    const titleStyle = {
        textAlign: "center",
        fontSize: "3rem",
        marginBottom: "0",
    }

    const descriptionStyle = {
        marginTop: "0",
        textAlign: "center",
        fontSize: "1.5rem",
        fontWeight: "600"
    }

    const textStyle = {
        textAlign: "left",
    }

    return (
        <div style={articleStyle}>
            <BackHeader />
            <div style={contentStyle}>
                <h1 style={titleStyle} className="nunito-bold">{article.title}</h1>
                <h2 style={descriptionStyle}>{article.description}</h2>
                <p style={textStyle}>{article.text}</p>
            </div>
        </div>
    );
}

export default Article;