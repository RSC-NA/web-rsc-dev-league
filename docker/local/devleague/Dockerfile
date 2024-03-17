FROM oven/bun

WORKDIR /var/www/vhosts/devleague
COPY . . 

RUN apt-get update && apt-get install -y curl bash unzip

RUN bun install 

ENV TZ EST

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

EXPOSE 6969/tcp
ENTRYPOINT [ "bun", "--watch", "index.js" ]

