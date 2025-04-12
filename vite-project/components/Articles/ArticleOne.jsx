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
                    <i>Note-ation: In this article, I use C(n, k) to mean ‘n choose k,’ the number of ways to choose k elements from a set of n. Similarly, P(n, k) is the number of ways to permute k elements of n</i>
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
                        <div style={{display: 'flex', alignItems: 'center', gap: '20px',}}>
                            <div>
                                <p>In a real cube, an edge can be oriented two ways, thought of as ‘flipping’ the edge. For the naive problem, we will ignore this.</p>
                                <p>What makes this problem interesting is that some edges may already be solved. For example, if edges (1) and (4) are already in their correct places before we start solving, we’re only looking for a cycle through the other 10 edges, since these two will never show up in another piece’s solved position, being already in their solved positions.</p>
                            </div>
                            <div style={{textAlign: 'center',}}>
                                <img style={{...imgStyle, width: '250px',}} src="/singleCycles/flipped_edges.png" alt="Naive Diagram" />
                                <p style={{fontSize: '1rem', marginTop: '0'}}>Exactly two edges can be flipped at a time</p>
                            </div>
                        </div>
                        <h4 className="nunito-bold" style={h4Style}>Reasoning Through the Naive Problem</h4>
                        <p>So, let’s count the number of possible single cycles of length k with this model. There is exactly 1 cycle of length 0 (the solved cube), and no cycles of length 1, since it’s impossible for only one edge to be out of place.</p>
                        <p>For k &gt; 1, you may be tempted to consider P(12, k). But this doesn’t work, because we have an extra condition that any edge cannot be in its solved position–any permutation that maps an edge to its rightful place must be discarded, because then the cycle will end preemptively and not contain enough edges.</p>
                        <p>Instead, let’s start by choosing the edges we need, C(12, k). With our k edges, we can choose any edge position in the cube, and then pick which edge will begin the cycle there. As discussed above, the edge we choose cannot belong in this starting position, so we have k - 1 possibilities for the first edge.</p>
                        <p>Now consider the edge in the solved position of the first edge. The calculation is similar—we have k-1 choices, though one of them, the edge that belongs in the first position, cannot be chosen (otherwise our cycle would end with these first two edges). So there are (k-1) * (k-2) choices for the first two positions. We can keep going until the end, where there will be 2! choices for the third-to-last, 1! for the second-to-last, and 0!=1 for the last. Therefore in total, there are C(12, k) * (k-1)! ways to get a cycle of length k.</p>
                        <p>Since all edges not in the cycle must be solved, there is 1 possibility for their positions, and they can be ignored in counting the total (or, if you’d rather, you can imagine multiplying each result by 1). So the table of cycles of length k for the naive problem is:</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/naive_table.png" alt="Naive Table" />
                    <div>
                        <h4 className="nunito-bold" style={h3Style}>Naive Answer</h4>
                        <p>This leads us to the answer to the naive problem. We simply sum up these expressions as k varies from 1 to 12, representing the cycles of all possible lengths. Since the values for k = 0 and k = 1 are 1 and 0 respectively, we get the following as the total number of appropriate cycles ignoring edge orientation:</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/naive_solution.png" alt="Naive Answer" />
                    <div>
                        <p>Computing this result and dividing by 12!, which represents the number of total edge permutations, gives us the answer to the naive problem of ~24.94%.</p>
                        <h3 className="nunito-bold" style={h3Style}>Complex Problem</h3>
                        <p>We are now ready to tackle the entire problem. Thankfully, this is basically identical to the naive problem, though we need to also consider edge orientation at every step. Since we will account for orientation for the edges in the cycle, this means all edges not in the cycle will have to be in their places (as in the naive case) and oriented properly. Because an edge has two orientations, I will denote “correct orientation” as a number being positive, and “incorrect orientation” as a number being negative, and I will refer to swapping the sign of one of these numbers as “flipping the edge”. </p>
                        <p>I have to mention one more thing—in the same way you must swap an edge with another edge, <a style={{color: 'rgb(186, 137, 255)'}} href="https://puzzling.stackexchange.com/questions/521/why-cant-i-have-only-one-edge-piece-flipped-on-a-3x3-rubiks-cube">you must flip the orientation of two edges at once</a>. This means the number of correctly- and incorrectly- oriented edges must always both be even, as a solved cube has 12 correctly- and 0 incorrectly-oriented edges, and any swap that changes the totals must preserve both parities. The diagram below should answer some questions about what is and isn’t allowed:</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/illustrative_examples.png" alt="Orientation Diagram" />
                    <div>
                        <h4 className="nunito-bold" style={h4Style}>Reasoning Through the Complex Problem</h4>
                        <p>The calculations are very similar, though we now of course have to account for orientation. We know how to find the naive number of cycles of length k, and for a given cycle we can flip any even number of edges in the cycle. As it turns out, for a given cycle of length k, there are 2^(k-1) possible different ways of legally flipping the edges.</p>
                        <p>One way to see this is to set aside one edge, then go through the others. For every edge you flip, also flip the edge put aside, so that you always flip 2 edges at the same time to keep everything legal. Since there are k-1 other edges, and each of them presents two possibilities (to flip,, or not to flip), and the orientation of the edge put aside is uniquely determined by the orientations of the other edges, there must be 2^(k-1) legal ways to flip k edges.</p>
                        <p>Another fancier way to see this is to consider all subsets (edges to be flipped) of a set of k elements (edges in the cycle). In total, there are 2^k such subsets, since every edge presents two possibilities (to flip,, or not to flip), and it is known that for any set <a href="https://math.stackexchange.com/questions/483457/the-number-of-odd-size-subsets-is-equal-to-the-number-of-even-size-subsets">the number of even subsets is equal to the number of odd subsets</a>. We care about even subsets, since at all times the number of flipped edges must be even, so we take half the total, or 2^(k-1).</p>
                        <p>Either way, this very cleanly extends what we found in the naive version. We simply need to multiply the numbers we found in the naive example by 2^(k-1) for k &gt; 1. I’ve again written out the number of possible cycles of length k:</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/complex_table.png" alt="Complex Table" />
                    <div style={{width: '100%'}}>
                        <h4 className="nunito-bold" style={h4Style}>Final Answer</h4>
                        <p>So, similar to in the naive case, the total number of cycles of edges comes out to:</p>
                    </div>
                    <img style={imgStyle} src="/singleCycles/complex_solution.png" alt="Complex Answer" />
                    <p>As we found, there are 2^(k-1) legal orientations for every collection of k edges, and the total number of permutations is 12!, as in the naive case. So we divide this expression by 12! * 2^11. In the end, the result is ~14.40%.</p>
                </div>
            </div>
        </div>
    );
}

export default ArticleOne;