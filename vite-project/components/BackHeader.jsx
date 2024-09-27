import { Link } from 'react-router-dom';

function BackHeader() {
    const portfolioTitleStyle = {
        width: '100vw',
        display: 'flex',
        justifyContent: 'center',
        ailgnItems: 'center',
        flexDirection: 'row',
        background: 'var(--lightbg)',
        color: 'white',
        height: '21.5vh',
        borderBottom: '5px solid var(--lightestblue)',
    }

    const projectsTitleStyle = {
        fontSize: '4vw',
        marginLeft: "15vw",
        marginBottom: "0",
    }

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flex: '1',
        position: 'absolute',
    };

    const projectsButtonStyle = {
        position: 'absolute',
        top: '2vh',
        right: '7vw',
    };

    const handleCloseTab = (e) => {
        e.preventDefault();
        window.close();
    }
    return (
        <div style={portfolioTitleStyle}>
            <h2 style={projectsTitleStyle}>Return Home</h2>
            <div style={buttonDivStyle}>
                <Link
                    className="left-button circle-button"
                    style={projectsButtonStyle}
                    to="/"
                    onClick={handleCloseTab}
                >
                    <img
                        src="./downArrow.png"
                        className="button-image"
                        alt="Scroll Up"
                        style={{ pointerEvents: 'none' }}
                    />
                </Link>
            </div>
        </div>
    )
}

export default BackHeader;