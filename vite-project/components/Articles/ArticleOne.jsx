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
        width: '70%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    }

    const headerStyle = {
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
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    }

    const h3Style = {
        marginBottom: '0',
        marginTop: '80px',
        fontSize: '1.75rem',
    }

    const h4Style = {
        fontSize: '1.5rem',
        marginTop: '40px',
    }

    const imgStyle = {
        width: '70%',
        margin: '5px 0',
        borderRadius: '10px',
        border: '5px solid var(--lightestblue)',
    }

    return (
        <div style={articleStyle}>
            <BackHeader />
            <div style={contentStyle}>
                <div style={headerStyle}>
                    <h1 style={titleStyle} className="nunito-bold">Single Cycles</h1>
                    <h2 style={descriptionStyle}>A Story of Math, Coding, and Solving Rubik's Cubes Blindfolded</h2>
                    <i>Note-ation: In this article, I use C(n, k) to mean ‘n choose k,’ the number of ways to choose k elements from a set of n. Similarly, P(n, k) is the number of permutations of k elements of n</i>
                </div>
                <div style={writingStyle}>
                    <div>
                        <h3 className="nunito-bold" style={h3Style}>Introduction</h3>
                        <p>A rubik’s cube is made up of 12 edges, 8 corners, and 6 centers, though this article will only look at edges. In this article, ‘edge position’ will be one of the 12 places an edge can be on the cube. An edge’s solved position is the edge position it occupies in a solved cube. An edge will also ‘belong’ in its solved position.</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/cube_pieces_diagram.png" alt="Cube Peices Diagram" />
                    <p>Each edge can be moved to any edge position and (for the purposes of this article) any two edges can be swapped at will. If you were crazy enough to try to solve a rubik’s cube blindfolded, this introduces a simple beginner-level strategy, called Old Pochmann: choose an edge and solve it by swapping it with the edge in its solved position.  Now solve that edge by swapping it with the edge in its solved position, on and on until all the edges are solved. If we denote the 12 edges by the numbers (1), (2), …, (12), we can imagine simplifying these swaps to a cycle, as below:</p>
                    <img style={imgStyle} src="/singleCycles/simple_chain.png" alt="Simple Chain" />
                    <div>
                        <p>However, a problem arises if the cycle doesn’t involve every edge. In the diagram above, say the arrow from 8 points back to 1 instead. Then edges 9-12 may not be solved! So we need to start a new cycle to solve the remaining pieces—and if that cycle isn’t enough again, we may need to start a third, and so on. The question this article will answer is: what’s the probability that, given a scrambled rubik’s cube, there will only be a single cycle required to solve the edges?</p>
                        <h3 className="nunito-bold" style={h3Style}>Naive Problem</h3>
                        <p>In a real cube, an edge can be oriented two ways, thought of as ‘flipping’ the edge. For the naive problem, we will ignore this.</p>
                        <p>What makes this problem interesting is that some edges may already be solved. For example, if edges (1) and (4) are already in their correct places before we start solving, we’re only looking for a cycle through the other 10 edges, since these two will never show up in another piece’s solved position, being already in their own edge positions.</p>
                        <h4 className="nunito-bold" style={h4Style}>Reasoning Through the Naive Problem</h4>
                        <p>So, let’s count the number of possible one-cycles of length k with this model. There is exactly 1 cycle of length 0 (the solved cube), and no cycles of length 1, since it’s impossible for only one edge to be out of place.</p>
                        <p>For k &gt; 1, you may be tempted to consider P(12, k). But this doesn’t work, because we have an extra condition that any edge cannot be in its own place–any permutation that maps an edge to its rightful place must be discarded, because then the cycle won’t contain enough edges.</p>
                        <p>Instead, let’s start by choosing the edges we need, C(12, k). With our k edges, we can choose any edge position in the cube, and then pick which edge will begin the cycle there. As discussed above, the edge we choose cannot belong in this starting position, so we have k - 1 possibilities for the first edge.</p>
                        <p>The next edge is similar—we have k-1 choices, though one of them, the edge that belongs in the first position, cannot be chosen (otherwise our cycle would end with these first two edges). So there are (k-1) * (k-2) choices for the first two positions. We can keep going until the end, where there will be 2! choices for the third-to-last, 1! for the second-to-last, and 0!=1 for the last. Therefore in total, there are C(12, k) * (k-1)! ways to get a cycle of length k.</p>
                        <p>Since all edges not in the cycle must be solved, there is 1 possibility for their positions, and they can be ignored in counting the total (or, if you’d rather, you can imagine multiplying each result by 1). So the table of cycles of length k for the naive problem is:</p>
                    </div>
                    <p>This page is a WIP! I'll finish uploading everything soon.</p>
                </div>
            </div>
        </div>
    );
}

export default ArticleOne;