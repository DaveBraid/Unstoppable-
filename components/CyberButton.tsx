import React from 'react';

interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'success';
}

export const CyberButton: React.FC<CyberButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  disabled,
  ...props 
}) => {
  // Brutalist Base Styles
  const baseStyles = "relative px-6 py-4 font-black text-xl uppercase tracking-wider transition-all duration-75 border-4 border-black shadow-hard shadow-hard-active transform disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none";
  
  const variants = {
    // Electric Yellow background, Black text
    primary: "bg-[#ffff00] text-black hover:bg-[#ffe600]",
    // Hot Pink background, White text
    danger: "bg-[#ff0099] text-white hover:bg-[#d60080]",
    // Acid Green background, Black text
    success: "bg-[#00ff00] text-black hover:bg-[#00cc00]"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      disabled={disabled}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};