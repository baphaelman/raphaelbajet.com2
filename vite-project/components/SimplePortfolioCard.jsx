function SimplePortfolioCard({ header, description, github}) {
    const githubLogoStyle = {
        width: "50px",
        height: "50px",
        marginRight: "10px",
    }
  return (
    <a className="portfolio-box">
        <div className="portfolio-text">
            <h2 className="portfolio-header nunito-bold">{'>'} {header}</h2>
            <p className="portfolio-description">{description}</p>
        </div>
    </a>
  );
}

export default SimplePortfolioCard;