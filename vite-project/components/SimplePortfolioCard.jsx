function SimplePortfolioCard({ header, text}) {
  return (
    <div className="portfolio-card">
      <h2>{'>'} {header}</h2>
      <p>{text}</p>
    </div>
  );
}

export default SimplePortfolioCard;