import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';

function Home() {
    const [scrollPosition, setScrollPosition] = useState(0);
    let scrollPosition1 = scrollPosition / 5;
    let scrollPosition2 = scrollPosition / 20;
    let scrollPosition3 = scrollPosition / 12.5;

    const handleScroll = () => {
        setScrollPosition(window.scrollY);
    };

    useEffect(() => {
        // Add a scroll event listener to track the scroll position
        window.addEventListener('scroll', handleScroll);

        // Clean up the event listener when the component unmounts
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    function scrollDown(event) {
        const buttonNumber = parseInt(event.target.dataset.number);
        const targetDivNumber = buttonNumber + 1;
        const targetElement = document.getElementById(`div${targetDivNumber}`);

        const initialY = window.pageYOffset;
        const targetY = targetElement.getBoundingClientRect().top + initialY;
        const distance = targetY - initialY;
        const duration = 1500;

        const easeInOut = (t) =>
            t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

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

    const nameStyle = {
        fontSize: '10vw',
        margin: '0',
    };

    const div1Style = {
        margin: '0',
        fontWeight: '300',
        background: 'var(--bg)',
        color: 'var(--offwhite)',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
    };

    const div2Style = {
        margin: '0',

        background: 'var(--bg)',
        color: 'var(--offwhite)',
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
            <div style={div1Style} id="div1">
                <div>
                    <h2
                        style={{
                            ...nameStyle,
                            paddingLeft: '30vw',
                            transform: `translateX(-${scrollPosition1}vw)`,
                        }}
                        className="name-1"
                    >
                        Hi! My name is
                    </h2>
                    <h2
                        style={{
                            ...nameStyle,
                            paddingLeft: '5vw',
                            transform: `translateX(${scrollPosition2}vw)`,
                        }}
                        className="name-2"
                    >
                        Raphaël Bajet.
                    </h2>
                    <h2
                        style={{
                            ...nameStyle,
                            paddingLeft: '15vw',
                            marginTop: '1vw',
                            transform: `translateX(-${scrollPosition3}vw)`,
                        }}
                        className="name-3"
                    >
                        Call me Raphaël.
                    </h2>
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
                            style={{ pointerEvents: 'none' }} // Add this line
                        />
                    </button>
                </div>
            </div>

            <div style={div2Style} id="div2">
                <button id="dogs-button" className="page-button">
                    Dogs
                </button>
                <button
                    id="art-button"
                    className="page-button"
                    style={{
                        borderBottom: '0.5vw solid var(--lightestblue)',
                        borderTop: '0.5vw solid var(--lightestblue)',
                    }}
                >
                    Art
                </button>
                <button id="aboutme-button" className="page-button">
                    About Me
                </button>
            </div>
            <div style={div3Style} id="div3"></div>
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
