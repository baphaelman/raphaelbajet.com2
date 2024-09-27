import Modal from 'react-modal';

function PdfModal({ isOpen, closeModal, file }) {
    const modalStyle = {
        content: {
            width: '80%',
            height: '80%',
            margin: 'auto',
            borderRadius: '0.5em',
            border: 'var(--lightestblue) 5px solid',
        },
    };

    return (
        <Modal isOpen={isOpen} closeModal={closeModal} style={modalStyle}>
            <button onClick={closeModal}>Close</button>
            <a href={file} download>
                <button>Download PDF</button>
            </a>
            <iframe src={file} style={{ width: '100%', height: '100%'}} />
        </Modal>
    );
}

export default PdfModal;