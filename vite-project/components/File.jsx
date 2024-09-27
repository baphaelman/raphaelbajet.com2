function File({ file }) {
    const iframeStyle = {
        width: '100%',
        height: '400px',
    };

    return (
        <div>
            <iframe style={iframeStyle} src={file} />
        </div>
    );
}

export default File;