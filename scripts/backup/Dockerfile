FROM amazon/aws-cli:2.27.41 AS aws-cli

FROM mysql:8.0

COPY --from=aws-cli /usr/local/aws-cli/ /usr/local/aws-cli/
RUN microdnf install -y gzip tar util-linux && microdnf clean all \
    && ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws \
    && aws --version && mysqldump --version && flock --version

COPY --chmod=0755 backup.sh /usr/local/bin/healthlink-backup
ENTRYPOINT ["/usr/local/bin/healthlink-backup"]
CMD ["schedule"]
