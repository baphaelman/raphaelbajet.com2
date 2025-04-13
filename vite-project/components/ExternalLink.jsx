function ExternalLink({ children, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="external-link"
    >
      {children}
    </a>
  );
}

export default ExternalLink;