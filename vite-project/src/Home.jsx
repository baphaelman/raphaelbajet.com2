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

    function startAnimation() {
        const targetY = window.innerHeight;
        const initialY = window.scrollY;
        const distance = targetY - initialY;
        const duration = 1500; // Adjust as needed

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

    function easeInOut(t) {
        return t < 0.5
            ? 4 * t * t * t
            : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    const nameStyle = {
        fontSize: '10vw',
        margin: '0',
    };

    const div1Style = {
        margin: '0',

        background: 'var(--bg)',
        color: 'black',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
    };

    const div2Style = {
        margin: '0',

        background: 'var(--white)',
        color: 'black',
        width: '100vw',
        height: '100vh',
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
            <style>
                @import
                url('https://fonts.googleapis.com/css2?family=Raleway:wght@100&display=swap');
            </style>
            <div style={div1Style} className="div1">
                <div>
                    <h2
                        style={{
                            ...nameStyle,
                            paddingTop: '5vw',
                            marginLeft: '30vw',
                            transform: `translateX(-${scrollPosition1}vw)`,
                        }}
                        className="name-1"
                    >
                        Hi! My name is
                    </h2>
                    <h2
                        style={{
                            ...nameStyle,
                            marginLeft: '5vw',
                            transform: `translateX(${scrollPosition2}vw)`,
                        }}
                        className="name-2"
                    >
                        Raphaël Bajet.
                    </h2>
                    <h2
                        style={{
                            ...nameStyle,
                            marginLeft: '15vw',
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
                        onClick={() => startAnimation()}
                    >
                        <img src="./downArrow.png" className="button-image" />
                    </button>
                </div>
            </div>
            <div style={div2Style} className="div2">
                Why this no work
            </div>
        </div>
    );
}

export default Home;

{
    /*      <nav className="navbar">
                <a href="/" className="navbar-link link-1">
                    Home
                </a>
                <a href="/art" className="navbar-link link-2">
                    Art
                </a>
                <a href="/dogs" className="navbar-link link-3">
                    Dogs
                </a>
            </nav>


            
<img
src="suitPicture.jpg"
alt="Raphaël Bajet"
className="profile-picture"
/>
<div class="name">
<h2>Raphael</h2>
<h2>Bajet</h2>
</div>

*/
}
