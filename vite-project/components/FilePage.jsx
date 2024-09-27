import React, { useEffect } from 'react';
import FileGrid from "./FileGrid";
import BackHeader from "/components/BackHeader.jsx";

function FilePage({ file }) {
    useEffect(() => { // enable scrolling for this page
        document.body.style.overflow = 'auto';
        return () => {
            document.body.style.overflow = 'hidden';
        };
    }, []);

    const containerStyle = {
        overflow: 'scoll',
        display: 'flex',
        width: '100vw',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
    }

    const titleStyle = {
        fontSize: '2rem',
        marginBottom: '0.5em',
    }

    const descriptionStyle = {
        marginTop: '0',
        fontSize: '1.1em',
    }
    return (
        <div style={containerStyle}>
            <BackHeader />
            <h1 style={titleStyle}>{file.title}</h1>
            <h2 style={descriptionStyle}>{file.description}</h2>
            <FileGrid file={file} />
        </div>
    )
}

export default FilePage;