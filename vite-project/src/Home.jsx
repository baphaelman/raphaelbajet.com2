import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';

function Home() {
    const [scrollPosition, setScrollPosition] = useState(0);
    let scrollPosition1 = scrollPosition / 5;
    let scrollPosition2 = scrollPosition / 20;
    let scrollPosition3 = scrollPosition / 12.5;

    const dogsButton = document.getElementById('dogs-button');
    const [lastPageButton, setLastPageButton] = useState(null);

    const handleScroll = () => {
        setScrollPosition(window.scrollY);
    };

    useEffect(() => {
        // Add a scroll event listener to track the scroll position
        window.addEventListener('scroll', handleScroll);
        setLastPageButton(dogsButton);
        // Clean up the event listener when the component unmounts
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [dogsButton]);

    function easeInOut(t) {
        return t < 0.5
            ? 4 * t * t * t
            : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    function scrollDown(event) {
        const buttonNumber = parseInt(event.target.dataset.number);
        const targetDivNumber = buttonNumber + 1;
        const targetElement = document.getElementById(`div${targetDivNumber}`);

        const initialY = window.scrollY;
        const targetY = targetElement.getBoundingClientRect().top + initialY;
        const distance = targetY - initialY;
        const duration = 1500;

        let startTime;

        function scroll(time) {
            if (!startTime) {
                startTime = time;
            }

            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeInOut(progress);

            window.scrollTo(0, initialY + distance * easedProgress);

            if (progress < 1) {
                requestAnimationFrame(scroll);
            }
        }

        requestAnimationFrame(scroll);
    }

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

    function scrollSide(event) {
        const buttonString = event.target.dataset.string;
        const targetElement = document.getElementById(`${buttonString}-page`);

        const initialY = window.scrollY;
        const initialX = window.scrollX;
        const targetX = targetElement.getBoundingClientRect().left + initialX;
        const distance = targetX - initialX;
        const duration = 1500;

        let startTime;

        function scroll(time) {
            if (!startTime) {
                startTime = time;
            }

            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeInOut(progress);

            window.scrollTo(initialX + distance * easedProgress, initialY);

            if (progress < 1) {
                requestAnimationFrame(scroll);
            }
        }

        requestAnimationFrame(scroll);
    }

    function scrollSide2(event) {
        const buttonString = event.target.dataset.string;
        const targetElement = document.getElementById(`${buttonString}-page`);

        const targetX =
            targetElement.getBoundingClientRect().left +
            window.scrollX -
            window.innerWidth;
        const targetY = window.scrollY;

        window.scrollTo({
            left: targetX,
            top: targetY,
            behavior: 'smooth',
        });
    }

    const nameStyle = {
        fontSize: '10vw',
        margin: '0',
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
        background: 'red',
        transform: 'translate(100vw, -200vh)',
    };

    const artPageStyle = {
        height: '100vh',
        width: '100vw',
        background: 'green',
        transform: 'translate(-100vw, -300vh)',
    };

    const buttonDivStyle = {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        flex: '1',
    };

    return (
        <div>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link
                href="https://fonts.googleapis.com/css2?family=Nunito:wght@200&display=swap"
                rel="stylesheet"
            />
            <div style={div1Style} id="div1" className="page">
                <div>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '30vw',
                            transform: `translateX(-${scrollPosition1}vw)`,
                        }}
                        className="name-1"
                    >
                        Hi! My name is
                    </h1>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '5vw',
                            transform: `translateX(${scrollPosition2}vw)`,
                        }}
                        className="name-2"
                    >
                        Raphaël Bajet.
                    </h1>
                    <h1
                        style={{
                            ...nameStyle,
                            paddingLeft: '15vw',
                            marginTop: '1vw',
                            transform: `translateX(-${scrollPosition3}vw)`,
                        }}
                        className="name-3"
                    >
                        Call me Raphaël.
                    </h1>
                </div>
                <div style={buttonDivStyle}>
                    <button
                        className="down-button"
                        onClick={scrollDown}
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
                        className="up-button"
                        onClick={scrollDown}
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
                    onClick={scrollSide}
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
                    onClick={scrollSide2}
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
                    onClick={scrollDown}
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
                        className="up-button"
                        onClick={scrollDown}
                        data-number="1"
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
            <div id="dogs-page" className="page" style={dogsPageStyle}></div>
            <div id="art-page" className="page" style={artPageStyle}></div>
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
