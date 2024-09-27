import Modal from 'react-modal';

function PdfModal({ isOpen, closeModal, pdf }) {
    const modalStyle = {
        content: {
            width: '60%',
            height: '80%',
            margin: 'auto',
            borderRadius: '0.5rem',
            padding: '0',
            overflow: 'hidden',
            background: 'transparent',
            boxSizing: 'border-box',

            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'var(--lightestblue) 5px solid', // because I couldn't find a way to apply border-bottom to the iframe
        },
    };

    const iframeContainerStyle = {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
    };

    const iframeStyle = {
        borderRadius: '0.5rem',
        width: '100%',
        height: '100%',
        border: 'var(--lightestblue) 5px solid',
        boxSizing: 'border-box',
    };

    const buttonsStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        gap: '10%',
        padding: '0',
        marginBottom: '1em',
    }

    const linkStyle = {
        width: '50%',
        padding: '0',
    }

    const buttonStyle = {
        color: 'var(--offwhite)',
        width: '50%',
        height: '4rem',
        borderRadius: '0.5rem',
        fontSize: '1.5em',
        padding: '0',
        border: 'var(--lightestblue) 5px solid',
    }

    return (
        <Modal isOpen={isOpen} closeModal={closeModal} style={modalStyle}>
            <div style={buttonsStyle}>
                <button onClick={closeModal} style={buttonStyle} className="pdf-modal-button">Close</button>
                <a href={pdf} download style={linkStyle}>
                    <button style={{...buttonStyle, width: '100%'}} className="pdf-modal-button">Download PDF</button>
                </a>
            </div>
            <div style={iframeContainerStyle}>
                <iframe
                    src={pdf}
                    style={iframeStyle}
                    onContextMenu={(e) => e.preventDefault()}
                />
            </div>
        </Modal>
    );
}

export default PdfModal;