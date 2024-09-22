function PortfolioCard(props) {

        const cardStyle = {
        gridArea: `${props.rStart} / ${props.cStart} / ${props.rEnd} / ${props.cEnd}`,
        border: '5px solid var(--lightestblue)', 
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '75%',
    }

    const imageStyle = {
        aspectRatio: '1 / 1',
        maxWidth: '80%',
        maxHeight: '80%',
        marginLeft: '2vw',
        marginTop: '2vw',
    }

    const imageDivStyle = {
        width: '100%',
        height: '100%',
        display: 'flex',
    }

    const headerDivStyle = {
        color: 'var(--lightestblue)',
        marginTop: '0.5vw',
        marginLeft: '2vw',
        fontSize: '2em',
        borderBottom: '2px solid var(--lightestblue)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'start',
    }

    const headerStyle = {
        fontFamily: 'Courier New, Courier, monospace',
        fontWeight: 'bold',
        marginBottom: '0',
        fontSize: '0.8em',
        paddingBottom: '1vw',
        borderBottom: '2px solid var(--lightestblue)',
    }   
    
    const textStyle = {
        marginTop: '1.5vw',
        width: '85%',
        fontFamily: 'Courier New, Courier, monospace',
        fontSize: '0.5em',
    }
        
    return (
        <div style={cardStyle}>
            <div style={imageDivStyle}>
                <img src={props.src} style={imageStyle}/>
                <div style={headerDivStyle}>
                    <p style={headerStyle}>{props.header}</p>
                    <p style={textStyle}>{props.text}</p>
                </div>
            </div>
        </div>
    )
}

export default PortfolioCard