import React from 'react';
import BackHeader from '/components/BackHeader.jsx';

function ArticleOne() {
    const articleStyle = {
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowY: "scroll",
    }

    const contentStyle = {
        padding: "1em",
        width: '80%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    }

    const titleStyle = {
        textAlign: "center",
        fontSize: "3rem",
        marginBottom: "0",
    }

    const descriptionStyle = {
        marginTop: "0",
        textAlign: "center",
        fontSize: "1.5rem",
        fontWeight: "600"
    }

    const writingStyle = {
        width: '100%',
        fontSize: '1.25rem',
    }

    return (
        <div style={articleStyle}>
            <BackHeader />
            <div style={contentStyle}>
                <h1 style={titleStyle} className="nunito-bold">Single Cycles</h1>
                <h2 style={descriptionStyle}>A Story of Math, Coding, and Solving Rubik's Cubes Blindfolded</h2>
                <i>Note-ation: In this article, I use C(n, k) to mean ‘n choose k,’ the number of ways to choose k elements from a set of n. Similarly, P(n, k) is the number of permutations of k elements of n</i>
                
                <div style={writingStyle}>
                    <h3 className="nunito-bold">Introduction</h3>
                    <p>A rubik’s cube is made up of 12 edges, 8 corners, and 6 centers, though this article will only look at edges. In this article, ‘edge position’ will be one of the 12 places an edge can be on the cube. An edge’s solved position is the edge position it occupies in a solved cube. An edge will also ‘belong’ in its solved position.</p>
                    <img src="/singleCycles/cube_pieces_diagram.png" alt="Cube Peices Diagram" style={{ width: '100%', maxWidth: '600px', margin: '1em 0' }} />
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                    <p>More text down here!!</p>
                </div>
            </div>
        </div>
    );
}

export default ArticleOne;