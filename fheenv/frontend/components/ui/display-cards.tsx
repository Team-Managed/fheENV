"use client";

import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { motion } from "motion/react";

export interface DisplayCardProps {
  className?: string;
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  date?: string;
  iconClassName?: string;
  titleClassName?: string;
}

export function DisplayCard({
  className,
  icon = <Sparkles className="size-4 text-indigo-500" />,
  title = "Encrypted",
  description = "FHE Secure Secrets",
  date = "Just now",
  iconClassName = "text-indigo-500",
  titleClassName = "text-indigo-900",
}: DisplayCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        "relative flex h-36 w-[22rem] -skew-y-[8deg] select-none flex-col justify-between rounded-xl border border-slate-200/50 bg-white/80 shadow-2xl shadow-indigo-100/50 backdrop-blur-md px-4 py-3 transition-all duration-700 after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[20rem] after:bg-gradient-to-l after:from-slate-50 after:to-transparent after:content-[''] hover:border-indigo-300 hover:bg-white [&>*]:flex [&>*]:items-center [&>*]:gap-2",
        className,
      )}
    >
      <div>
        <span className="relative inline-block rounded-full bg-indigo-50 border border-indigo-100 p-2">
          {icon}
        </span>
        <p className={cn("text-lg font-bold", titleClassName)}>{title}</p>
      </div>
      <p className="whitespace-nowrap text-lg text-slate-700 font-medium">{description}</p>
      <p className="text-slate-400 font-medium text-sm">{date}</p>
    </motion.div>
  );
}

interface DisplayCardsProps {
  cards?: DisplayCardProps[];
}

export default function DisplayCards({ cards }: DisplayCardsProps) {
  const defaultCards = [
    {
      title: "AES-256",
      description: "Military-grade standard",
      date: "Active",
      className:
        "[grid-area:stack] hover:-translate-y-10 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-slate-50/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      title: "Zero-Knowledge",
      description: "We can't read your data",
      date: "Verified",
      className:
        "[grid-area:stack] translate-x-12 translate-y-10 hover:-translate-y-1 before:absolute before:w-[100%] before:outline-1 before:rounded-xl before:outline-border before:h-[100%] before:content-[''] before:bg-blend-overlay before:bg-slate-50/50 grayscale-[100%] hover:before:opacity-0 before:transition-opacity before:duration-700 hover:grayscale-0 before:left-0 before:top-0",
    },
    {
      title: "Fully Homomorphic",
      description: "Compute on encrypted data",
      date: "State-of-art",
      className: "[grid-area:stack] translate-x-24 translate-y-20 hover:translate-y-10",
    },
  ];

  const displayCards = cards || defaultCards;

  return (
    <div className="grid [grid-template-areas:'stack'] place-items-center opacity-100 animate-in fade-in-0 duration-700">
      {displayCards.map((cardProps, index) => (
        <DisplayCard key={index} {...cardProps} />
      ))}
    </div>
  );
}
