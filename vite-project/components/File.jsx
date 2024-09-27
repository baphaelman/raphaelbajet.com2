import { useState }  from 'react';
import PdfModal from '/components/PdfModal.jsx';

function File({ image, pdf, title }) {
    const [modalIsOpen, setModalIsOpen] = useState(false);

    const fileStyle = {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '300px',
    };
    
    const overlayStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        borderRadius: '0.75rem',
    };

    const titleContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '2rem',
        margin: '0',
        padding: '0',
    }

    const imageContainerStyle = {
        position: 'relative',
        width: '100%',
        height: 'calc(100% - 2rem)',
        borderRadius: '1em',
        border: 'var(--lightestblue) 5px solid',
        cursor: 'pointer',
    };

    const imageStyle = {
        width: '100%',
        height: '100%',
        borderRadius: '0.7em',
        cursor: 'pointer',
    };

    const openModal = () => setModalIsOpen(true);
    const closeModal = (e) => {
        e.stopPropagation(); // so the modal isn't opened immediately after closing it
        setModalIsOpen(false);
    }

    return (
        <div style={fileStyle} onClick={openModal} className="file-container">
            <div style={titleContainerStyle}>
                <h2>{title}</h2>
            </div>
            <div style={imageContainerStyle}>
                <div className="file-overlay" style={overlayStyle}></div>
                <img style={imageStyle} src={image}/>
                <PdfModal isOpen={modalIsOpen} closeModal={closeModal} pdf={pdf} />
            </div>
        </div>
    );
}

export default File;