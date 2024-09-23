import { Link } from 'react-router-dom';

function SimplePortfolioCard({ header, description, href, onLinkClick}) {
  return (
    <Link className="portfolio-box" to={href} onClick={onLinkClick}>
        <div className="portfolio-text">
            <h2 className="portfolio-header nunito-bold">{'>'} {header}</h2>
            <p className="portfolio-description">{description}</p>
        </div>
    </Link>
  );
}

export default SimplePortfolioCard;