import { useState }  from 'react';
import PdfModal from '/components/PdfModal.jsx';

function File({ image, pdf }) {
    const [modalIsOpen, setModalIsOpen] = useState(false);

    const containerStyle = {
        position: 'relative',
        width: '100%',
        height: '300px',
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

    const overlayStyle = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        cursor: 'pointer',
    };

    const openModal = () => setModalIsOpen(true);
    const closeModal = () => setModalIsOpen(false);

    return (
        <div style={containerStyle}>
            <img style={imageStyle} src={image} onClick={openModal}/>
            <div style={overlayStyle} onClick={openModal}></div>
            <PdfModal isOpen={modalIsOpen} closeModal={closeModal} pdf={pdf} />
        </div>
    );
}

export default File;