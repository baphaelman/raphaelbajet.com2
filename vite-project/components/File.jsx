import { useState, useEffect, useRef }  from 'react';
import PdfModal from '/components/PdfModal.jsx';

function File({ image, pdf, title }) {
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [isHovering, setIsHovering] = useState(false);

    const overlayRef = useRef(null);
    const fileRef = useRef(null);

    const fileStyle = {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '300px',
        // border: 'var(--lightestblue) 5px solid', // uncomment to view borders
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

    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => setIsHovering(false);

    useEffect(() => { // fixes bug where overlay would remain hovered after closing modal
        setIsHovering(false);
    }, [modalIsOpen])

    useEffect(() => { // changes overlay color when hovering
        const overlay = overlayRef.current;
        if (isHovering) {
            overlay.classList.add('hovered-file');
        } else {
            overlay.classList.remove('hovered-file');
        }
    }, [isHovering]);

    useEffect(() => { // check if cursor is already hovering over the file on page load
        const handleMouseMove = (e) => {
            const file = fileRef.current;
            if (file) {
                const rect = file.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    setIsHovering(true);
                }
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return (
        <div
            ref={fileRef}
            style={fileStyle}
            onClick={openModal}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="file" 
        >
            <div style={titleContainerStyle}>
                <h2>{title}</h2>
            </div>
            <div style={imageContainerStyle}>
                <div ref={overlayRef} style={overlayStyle}></div>
                <img style={imageStyle} src={image}/>
                <PdfModal isOpen={modalIsOpen} closeModal={closeModal} pdf={pdf} />
            </div>
        </div>
    );
}

export default File;