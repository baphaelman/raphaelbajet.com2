function File({ file }) {
    const imageStyle = {
        width: '100%',
    }
    return (
        <div>
            <img style={imageStyle} src={file} />
        </div>
    );
}

export default File;