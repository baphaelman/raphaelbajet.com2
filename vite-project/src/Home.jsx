import { useState } from 'react';

import PortfolioCard from '/components/PortfolioCard.jsx';

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

    const projectsStyle = {
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
    };

    const meStyle = {
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
        displau: 'flex',
        flexDirection: 'column',
    };

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flex: '1',
        position: 'absolute',
        zIndex: '100',
    };

    /* the 'left' button in art, not the button that says art */
    const artButtonStyle = {
        position: 'absolute',
        bottom: '42vh',
        left: '62vw',
    };

    const projectsButtonStyle = {
        position: 'absolute',
        top: '2vh',
        right: '4vw',
    };

    const projectsTitleStyle = {
        fontSize: '4vw',
        marginLeft: '12vw',
    }

    const aboutMeButtonStyle = {
        position: 'absolute',
        left: '28.5vw',
        bottom: '42.5vh'
    }
    const portfolioStyle = {
        display: 'grid',
        gridTemplateRows: 'repeat(100, 1vw',
        gridTemplateColumns: 'repeat(100, 1vw)',
        width: '100vw',
        height: '100vh',
        overflow: 'auto',
    }

    const portfolioTitleStyle = {
        width: '100vw',
        display: 'flex',
        justifyContent: 'center',
        ailgnItems: 'center',
        flexDirection: 'row',
        background: 'var(--lightbg)',
        color: 'white',
        height: '25vh',
        borderBottom: '5px solid var(--lightestblue)',
    }

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
                <div style={{...buttonDivStyle, position: 'static'}}>
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
                    <h2 id="dogs-button-text">Me</h2>
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
                    <h2 id="aboutme-button-text">Portfolio</h2>
                    <img
                        src="./downArrow.png"
                        alt="Scroll Right"
                        id="aboutme-button-arrow"
                    />
                </button>
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
            </div>
            <div style={projectsStyle} className="page"> {/* hererererererererererererere PROJECTSPROJECTSPROJECTS */}
                <div style={portfolioTitleStyle}>
                    <h2 style={projectsTitleStyle}>Portfolio</h2>
                    <div style={buttonDivStyle}>
                        <button
                            className="up-button circle-button"
                            onClick={() => handleScroll(eventNumbers[1], '')}
                            style={projectsButtonStyle}
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
                <div style={portfolioStyle}> 
                    <PortfolioCard rStart='5' cStart='5' cEnd='60' rEnd='25' src='suitPicture.jpg' header='On the probability of getting a single edge cycle in a 3x3 blindfolded solve' text='A simplified example that nearly gets us there, and the final complexity step'/>
                    <PortfolioCard rStart='5' cStart='5' cEnd='60' rEnd='25' src='suitPicture.jpg' header='' text=''/>
                    <PortfolioCard rStart='5' cStart='65' cEnd='97' rEnd='50' src='dogs/bonny.jpg' header='' text=''/>
                    <PortfolioCard rStart='30' cStart='5' cEnd='32' rEnd='100' src='dogs/kaya.jpg' header='' text=''/>
                    <PortfolioCard rStart='30' cStart='37' cEnd='60' rEnd='50' header='' text=''/>
                    <PortfolioCard rStart='55' cStart='37' cEnd='98' rEnd='75' src='dogs/dogs_and_me.jpg' header='' text=''/>
                    <PortfolioCard rStart='80' cStart='37' cEnd='73' rEnd='100' src='' header='' text=''/>
                    <PortfolioCard rStart='80' cStart='78' cEnd='98' rEnd='100' src='' header='' text=''/>
                </div>
                
            </div>
            <div className="page" style={meStyle}> {/* hererererererererererererere MEMEMEMEMEMEMEMEMEMEMEMEME */}
                <div className="img-triple">
                    <button>
                        <img src="./aboutme/mosaic.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>Mosaic Session</h1>
                            <p>I like going to my local climbing gym, Mosaic Boulders</p>
                        </div>
                    </button>
                    <button>
                        <img src="./aboutme/heel_hook.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>Benchmark</h1>
                            <p>When I can, I go to Benchmark, a bit further away than Mosaic</p>
                        </div>
                    </button>
                    <button>
                        <img src="./aboutme/v3.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>First V3</h1>
                            <p>After a few sessions, I finally got my first V3!</p>
                        </div>
                    </button>
                </div>
                <div className="img-triple">
                    <button>
                        <img src="./aboutme/norcal.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>Norcal Nature</h1>
                            <p>Murrelet State Wilderness, during a road trip in June 2023</p>
                        </div>
                    </button>
                    <button>
                        <img src="./aboutme/henry_cowell.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>Henry Cowell's Garden of Eden</h1>
                            <p>Even on the go, I like to keep my style sharp</p>
                        </div>
                    </button>
                    <button>
                        <img src="./aboutme/sunol.jpg" alt="About Me" />
                        <div className="image-text">
                            <h1>Sunol Regional Wilderness</h1>
                            <p>One of my favorite places to hike in the East Bay</p>
                        </div>
                    </button>
                </div>
                <div style={buttonDivStyle}>
                    <button
                        className="left-button circle-button"
                        onClick={() => handleScroll(eventNumbers[2], '')}
                        data-number="0"
                        style={aboutMeButtonStyle}
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
            <div id="art-page" className="page" style={artPageStyle}>
                <div className="img-triple">
                    <button>
                        <img src="./art/art_drop.jpg" alt="Art" id="art-1" />
                        <div className="image-text">
                            <h1>Drop</h1>
                            <p>Hours of lokdown well spent</p>
                        </div>
                    </button>
                    <button>
                        <img src="./art/art_man.jpg" alt="Art" id="art-2" />
                        <div className="image-text">
                            <h1>Guy</h1>
                            <p>My favorite drawing</p>
                        </div>
                    </button>
                    <button>
                        <img src="./art/art_swirl.jpg" alt="Art" id="art-3" />
                        <div className="image-text">
                            <h1>Twirly</h1>
                            <p>Took hours, but I like the feeling it gives me</p>
                        </div>
                    </button>
                </div>
                <div className="img-triple">
                    <button>
                        <img src="./art/art_blue1.jpg" alt="Art" id="art-4" />
                        <div className="image-text">
                            <h1>Pierre #1</h1>
                            <p>First in my series to Pierre</p>
                        </div>
                    </button>
                    <button>
                        <img src="./art/art_blue2.jpg" alt="Art" id="art-5" />
                        <div className="image-text">
                            <h1>Pierre #2</h1>
                            <p>Second in my series to Pierre</p>
                        </div>
                    </button>
                    <button>
                        <img src="./art/art_blue3.jpg" alt="Art" id="art-6" />
                        <div className="image-text">
                            <h1>Pierre #3</h1>
                            <p>Final piece in my series to Pierre</p>
                        </div>
                    </button>
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
