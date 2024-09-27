import File from "/components/File.jsx";

function FileGrid({ file }) {
  const { id, path, title, description, images, pages } = file;
    const gridContainerStyle = {
        display: 'grid',
        width: '80vw',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: `repeat(${images.length/2}, 300px)`,
        gap: '2em',
        padding: '1em',
    }
  return (
    <div style={gridContainerStyle}>
      {images.map((image, index) => {
        return (
          <File key={index} image={image} pdf={pages[index]} />
        )
      })}
    </div>
  );
}

export default FileGrid;