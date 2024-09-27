function File({ file }) {
    const iframeStyle = {
        width: '100%',
        height: '300px',
        borderRadius: '0.5em',
        border: 'var(--lightestblue) 5px solid',
    };

    return (
        <div>
            <iframe style={iframeStyle} src={file} />
        </div>
    );
}

export default File;