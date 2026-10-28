import "./WeatherBackground.css";

const particles = Array.from({ length: 30 }, (_, index) => index);

export default function WeatherBackground({ weather }) {
  return (
    <div className={`weather-background weather-${weather}`} aria-hidden="true">
      {particles.map((particle) => (
        <span
          className="weather-particle"
          key={particle}
          style={{
            "--particle-position": `${(particle * 37) % 100}%`,
            "--particle-duration": weather === "rain"
              ? `${1.1 + (particle % 7) * 0.16}s`
              : weather === "snow"
                ? `${7 + (particle % 8) * 1.3}s`
                : weather === "wind"
                  ? `${5 + (particle % 6) * 1.1}s`
                  : `${5 + (particle % 6) * 1.1}s`,
            "--particle-delay": weather === "rain"
              ? `${particle * -0.19}s`
              : weather === "snow"
                ? `${particle * -0.72}s`
                : weather === "wind"
                  ? `${particle * -0.38}s`
                  : `${particle * -0.4}s`,
            "--particle-size": `${3 + (particle % 4)}px`,
            "--particle-top": `${10 + (particle % 6) * 13}%`,
            "--particle-width": `${30 + (particle % 5) * 15}px`,
          }}
        />
      ))}
      {weather === "sun" && <span className="weather-sun-glow" />}
      {weather === "wind" && (
        <div className="weather-wind-swirls">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
