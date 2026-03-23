import React from 'react';

const MarketplaceLogo = ({ marketplace, size = 24, className = "" }) => {
  if (marketplace === 'ml') {
    return (
      <img 
        src="/assets/ml_logo.webp" 
        alt="Mercado Livre" 
        style={{ width: size, height: size, objectFit: 'contain' }}
        className={`inline-block rounded-md ${className}`}
      />
    );
  }
  if (marketplace === 'shopee') {
    return (
      <img 
        src="/assets/shopee_logo.jpg" 
        alt="Shopee" 
        style={{ width: size, height: size, objectFit: 'contain' }}
        className={`inline-block rounded-md ${className}`}
      />
    );
  }
  return null;
};

export default MarketplaceLogo;
