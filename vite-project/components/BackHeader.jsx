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
        padding: '10px 40px',
        borderBottom: '5px solid var(--lightestblue)',
        gap: '20px',
    }

    const projectsTitleStyle = {
        fontSize: '4vw',
    }

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
    };

    {/*}
    const projectsButtonStyle = {
        position: 'absolute',
        top: '2vh',
        right: '7vw',
    };
    */}
    const projectsButtonStyle = {
    }

    return (
        <div style={portfolioTitleStyle}>
            <div style={buttonDivStyle}>
                <Link
                    className="left-button circle-button"
                    style={projectsButtonStyle}
                    to="/"
                >
                    <img
                        src="./downArrow.png"
                        className="button-image"
                        alt="Scroll Up"
                        style={{ pointerEvents: 'none' }}
                    />
                </Link>
            </div>
            <h2 style={projectsTitleStyle}>Return Home</h2>
        </div>
    )
}

export default BackHeader;