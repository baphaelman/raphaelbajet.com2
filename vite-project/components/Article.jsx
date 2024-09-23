function Article({ article }) {

    const articleStyle = {
        width: "100vw",
        display: "flex",
        justifyContent: "center",
    }

    const contentStyle = {
        padding: "1rem",
        borderRadius: "10px",
        width: '80%',
    }

    const titleStyle = {
        textAlign: "center",
        fontSize: "3rem",
        marginBottom: "0",
    }

    const descriptionStyle = {
        textAlign: "center",
        fontSize: "1.5rem",
    }

    const textStyle = {
        textAlign: "left",
        fontSize: "1.2rem",
    }

    return (
        <div style={articleStyle}>
            <div style={contentStyle}>
                <h1 style={titleStyle} className="nunito-bold">{article.title}</h1>
                <h2 style={descriptionStyle}>{article.description}</h2>
                <p style={textStyle}>{article.text}</p>
            </div>
        </div>
    );
}

export default Article;