function SimplePortfolioCard({ header, description, href}) {
  return (
    <a className="portfolio-box" href={href}>
        <div className="portfolio-text">
            <h2 className="portfolio-header nunito-bold">{'>'} {header}</h2>
            <p className="portfolio-description">{description}</p>
        </div>
    </a>
  );
}

export default SimplePortfolioCard;