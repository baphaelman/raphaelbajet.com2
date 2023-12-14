import { useState } from 'react';
function Home() {
    const [marginTop, setMarginTop] = useState(0);
    const [marginLeft, setMarginLeft] = useState(0);
    const [textMarginLeft, setTextMarginLeft] = useState(0);
    const firstTextMarginLeft = textMarginLeft * (3 / 4);
    const secondTextMarginLeft = -1 * textMarginLeft;
    const thirdTextMarginLeft = textMarginLeft;

    function handleScroll(x, y) {
        if (x === 'down') {
            const newMarginTop = marginTop - 100;
            setMarginTop(newMarginTop);
        } else if (x === 'up') {
            const newMarginTop = marginTop + 100;
            setMarginTop(newMarginTop);
        } else if (x === 'left') {
            const newMarginRight = marginLeft + 100;
            setMarginLeft(newMarginRight);
        } else if (x === 'right') {
            const newMarginRight = marginLeft - 100;
            setMarginLeft(newMarginRight);
        }

        if (y === 'down') {
            const newTextMarginLeft = textMarginLeft + 80;
            setTextMarginLeft(newTextMarginLeft);
        } else if (y === 'up') {
            const newTextMarginLeft = textMarginLeft - 80;
            setTextMarginLeft(newTextMarginLeft);
        }
    }

    const pageStyle = {
        marginTop: marginTop + 'vh',
        marginLeft: marginLeft + 'vw',
        transition: 'all 1.5s ease',
    };

    const eventNumbers = ['down', 'up', 'left', 'right'];

    const [lastPageButton, setLastPageButton] = useState(null);

    const pageButtons = document.getElementsByClassName('page-button');
    Array.from(pageButtons).forEach((button) => {
        button.addEventListener('mouseenter', () => handleMouseEnter(button), {
            once: true,
        });
    });

    function handleMouseEnter(button) {
        if (lastPageButton !== null) {
            lastPageButton.classList.remove('expanded');
        }
        button.classList.add('expanded');
        setLastPageButton(button);
    }

    const nameStyle = {
        fontSize: '10vw',
        margin: '0',
        whiteSpace: 'nowrap',
    };

    const div1Style = {
        margin: '0',
        fontWeight: '300',
        background: 'var(--bg)',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
    };

    const div2Style = {
        margin: '0',

        background: 'var(--bg)',
        width: '100vw',
        height: '100vh',

        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    };

    const div3Style = {
        width: '100vw',
        height: '100vh',
        background: 'var(--offwhite)',
        display: 'flex',
        justifyContent: 'center',
    };

    const dogsPageStyle = {
        height: '100vh',
        width: '100vw',
        background: 'var(--bg)',
        transform: 'translate(100vw, -200vh)',
    };

    const artPageStyle = {
        height: '100vh',
        width: '100vw',
        background: 'var(--bg)',
        transform: 'translate(-100vw, -300vh)',
    };

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flex: '1',
    };

    const firstArtStyle = {
        width: '100vw',
        display: 'flex',
        justifyContent: 'space-around',
    };

    const blueArtStyle = {
        width: '100vw',
        display: 'flex',
        justifyContent: 'space-around',
    };

    /* the 'left' button in art, not the button that says art */
    const artButtonStyle = {
        position: 'absolute',
        right: '29vw',
        top: '50%',

        zIndex: '1',
    };

    return (
        <div style={pageStyle}>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link
                href="https://fonts.googleapis.com/css2?family=Nunito:wght@200&display=swap"
                rel="stylesheet"
            />

            <div style={div1Style} id="div1">
                <div>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '30vw',
                            marginLeft: firstTextMarginLeft + 'vw',
                            transition: 'all 1.5s ease',
                        }}
                        className="name-1 name"
                    >
                        Hi! My name is
                    </h1>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '5vw',
                            marginLeft: secondTextMarginLeft + 'vw',
                            transition: 'all 1.5s ease',
                        }}
                        className="name-2 name"
                    >
                        Raphaël Bajet.
                    </h1>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '15vw',
                            marginTop: '1vw',
                            marginLeft: thirdTextMarginLeft + 'vw',
                            transition: 'all 1.5s ease',
                        }}
                        className="name-3 name"
                    >
                        Call me Raphaël.
                    </h1>
                </div>
                <div style={buttonDivStyle}>
                    <button
                        className="circle-button"
                        onClick={() =>
                            handleScroll(eventNumbers[0], eventNumbers[1])
                        }
                        data-number="1"
                    >
                        <img
                            src="./downArrow.png"
                            className="button-image"
                            alt="Scroll Down"
                        />
                    </button>
                </div>
            </div>
            <div style={div2Style} id="div2" className="page">
                <div style={buttonDivStyle} className="up-button-div">
                    <button
                        className="up-button circle-button"
                        onClick={() =>
                            handleScroll(eventNumbers[1], eventNumbers[0])
                        }
                        data-number="0"
                    >
                        <img
                            src="./downArrow.png"
                            className="button-image"
                            alt="Scroll Up"
                            style={{ pointerEvents: 'none' }}
                        />
                    </button>
                </div>
                <div className="profile-picture-div">
                    <img
                        src="./suitPicture.jpg"
                        alt="Raphaël Bajet"
                        className="profile-picture"
                    />
                </div>
                <button
                    id="dogs-button"
                    className="page-button expanded"
                    onClick={() => handleScroll(eventNumbers[3], '')}
                    data-string="dogs"
                >
                    <h2 id="dogs-button-text">Dogs</h2>
                    <img
                        src="./downArrow.png"
                        alt="Scroll Right"
                        id="dogs-button-arrow"
                    />
                </button>
                <button
                    id="art-button"
                    className="page-button"
                    onClick={() => handleScroll(eventNumbers[2], '')}
                    style={{
                        borderBottom: '0.5vw solid var(--lightestblue)',
                        borderTop: '0.5vw solid var(--lightestblue)',
                    }}
                    data-string="art"
                >
                    <img
                        src="./downArrow.png"
                        alt="Scroll Right"
                        id="art-button-arrow"
                    />
                    <h2 id="art-button-text">Art</h2>
                </button>
                <button
                    id="aboutme-button"
                    className="page-button"
                    onClick={() => handleScroll(eventNumbers[0], '')}
                    data-number="2"
                >
                    <h2 id="aboutme-button-text">About Me</h2>
                    <img
                        src="./downArrow.png"
                        alt="Scroll Right"
                        id="aboutme-button-arrow"
                    />
                </button>
            </div>
            <div style={div3Style} id="div3" className="page">
                <div style={buttonDivStyle} className="up-button-div">
                    <button
                        className="up-button circle-button"
                        onClick={() => handleScroll(eventNumbers[1], '')}
                        data-number="0"
                    >
                        <img
                            src="./downArrow.png"
                            className="button-image"
                            alt="Scroll Up"
                            style={{ pointerEvents: 'none' }}
                        />
                    </button>
                </div>
            </div>
            <div id="dogs-page" className="page" style={dogsPageStyle}>
                <div style={buttonDivStyle} className="right-button-div">
                    <button
                        className="left-button circle-button"
                        onClick={() => handleScroll(eventNumbers[2], '')}
                        data-number="0"
                    >
                        <img
                            src="./downArrow.png"
                            className="button-image"
                            alt="Scroll Up"
                            style={{ pointerEvents: 'none' }}
                        />
                    </button>
                </div>
                <div style={blueArtStyle}>
                    <img src="./dogs/mosaic.jpg" alt="Art" />
                    <img src="./dogs/heel_hook.jpg" alt="Art" />
                    <img src="./dogs/v3.jpg.jpg" alt="Art" />
                </div>
            </div>
            <div id="art-page" className="page" style={artPageStyle}>
                <div style={firstArtStyle} className="art-triple">
                    <img src="./art/art_drop.jpg" alt="Art" id="art-1" />
                    <img src="./art/art_man.jpg" alt="Art" id="art-2" />
                    <img src="./art/art_swirl.jpg" alt="Art" id="art-3" />
                </div>
                <div style={buttonDivStyle} className="right-button-div">
                    <button
                        className="right-button circle-button"
                        onClick={() => handleScroll(eventNumbers[3], '')}
                        data-number="0"
                        style={artButtonStyle}
                    >
                        <img
                            src="./downArrow.png"
                            className="button-image"
                            alt="Scroll Right"
                            style={{ pointerEvents: 'none' }}
                        />
                    </button>
                </div>
                <div style={blueArtStyle} className="art-triple">
                    <img src="./art/art_blue1.jpg" alt="Art" id="art-4" />
                    <img src="./art/art_blue2.jpg" alt="Art" id="art-5" />
                    <img src="./art/art_blue3.jpg" alt="Art" id="art-6" />
                </div>
            </div>
        </div>
    );
}

export default Home;

{
    /*     
            
<img
src="suitPicture.jpg"
alt="Raphaël Bajet"
className="profile-picture"
/>

*/
}
