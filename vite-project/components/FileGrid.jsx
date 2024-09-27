import File from "/components/File.jsx";

function FileGrid({ files }) {
    const gridContainerStyle = {
        display: 'grid',
        width: '80vw',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '300px',
        gap: '2em',
        padding: '1em',
    }
  return (
    <div style={gridContainerStyle}>
      {files.map((file) => (
        <File key={file.id} file={file} />
      ))}
    </div>
  );
}

export default FileGrid;