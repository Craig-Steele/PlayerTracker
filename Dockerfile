FROM swift:6.2-jammy AS build

WORKDIR /build

COPY Package.swift Package.resolved ./
RUN swift package resolve

COPY Server-Vapor ./Server-Vapor
RUN swift build -c release --product PlayerTracker

FROM swift:6.2-jammy AS runtime

WORKDIR /app

RUN useradd --system --create-home --home-dir /home/playertracker playertracker \
    && mkdir -p /app/data \
    && chown -R playertracker:playertracker /app

COPY --from=build /build/.build/release/PlayerTracker /app/PlayerTracker
COPY Client-Web /app/Client-Web

ENV PLAYERTRACKER_DATA_DIR=/app/data \
    PLAYERTRACKER_ENV=production \
    ROLL4INITIATIVE_LAUNCH_BROWSER=0 \
    ROLL4INITIATIVE_OPEN_LOCAL_FOLDERS=0

USER playertracker

EXPOSE 8080
ENTRYPOINT ["/app/PlayerTracker"]
