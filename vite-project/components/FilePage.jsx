import React, { useEffect } from 'react';
import FileGrid from "./FileGrid";
import BackHeader from "/components/BackHeader.jsx";

function FilePage({ file }) {
    useEffect(() => {
        // Enable scrolling for this page
        document.body.style.overflow = 'auto';

        // Cleanup function to revert overflow property when component unmounts
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
    return (
        <div style={containerStyle}>
            <BackHeader />
            <h1>{file.title}</h1>
            <h2>{file.description}</h2>
            <FileGrid files={file.pages} />
        </div>
    )
}

export default FilePage;