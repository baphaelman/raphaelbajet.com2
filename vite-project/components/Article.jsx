import React from 'react';
import { Link } from 'react-router-dom';

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


    /* repeated code bc I'm bad and lazy at this */
    const portfolioTitleStyle = {
        width: '100vw',
        display: 'flex',
        justifyContent: 'center',
        ailgnItems: 'center',
        flexDirection: 'row',
        background: 'var(--lightbg)',
        color: 'white',
        height: '21.5vh',
        borderBottom: '5px solid var(--lightestblue)',
    }

    const projectsTitleStyle = {
        fontSize: '4vw',
        marginLeft: "15vw",
        marginBottom: "0",
    }

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flex: '1',
        position: 'absolute',
        zIndex: '100',
    };

    const projectsButtonStyle = {
        position: 'absolute',
        top: '2vh',
        right: '7vw',
    };

    return (
        <div style={articleStyle}>
            <div style={portfolioTitleStyle}>
                <h2 style={projectsTitleStyle}>Return Home</h2>
                    <div style={buttonDivStyle}>
                        <Link
                            className="left-button circle-button"
                            style={projectsButtonStyle}
                            to="/"
                        >
                            <img
                                src="./downArrow.png"
                                className="button-image"
                                alt="Scroll Up"
                                style={{ pointerEvents: 'none' }}
                            />
                        </Link>
                    </div>
            </div>
            <div style={contentStyle}>
                <h1 style={titleStyle} className="nunito-bold">{article.title}</h1>
                <h2 style={descriptionStyle}>{article.description}</h2>
                <p style={textStyle}>{article.text}</p>
            </div>
        </div>
    );
}

export default Article;