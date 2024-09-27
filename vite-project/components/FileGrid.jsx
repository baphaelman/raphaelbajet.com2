import File from "/components/File.jsx";

function FileGrid({ files }) {
    const gridContainerStyle = {
        display: 'grid',
        width: '80vw',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'repeat(auto-fill, minmax(400px, 1fr))',
        gap: '1em',
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