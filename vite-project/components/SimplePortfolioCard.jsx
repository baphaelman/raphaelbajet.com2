import { Link } from 'react-router-dom';

function SimplePortfolioCard({ header, description, href}) {
  return (
    <Link className="portfolio-box" to={href} target="_blank">
        <div className="portfolio-text">
            <h2 className="portfolio-header nunito-bold">{'>'} {header}</h2>
            <p className="portfolio-description">{description}</p>
        </div>
    </Link>
  );
}

export default SimplePortfolioCard;